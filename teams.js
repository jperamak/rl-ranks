const commandLineArgs = require('command-line-args');
const {
    rankNameXpath,
    rankMMRXpath,
    distributionRankNameXpath,
    distributionRankMMRXpath,
    rankNames,
    playlists,
    optionDefinitions
} = require('./constants');
const {
    parseRegistrations,
    saveToFile,
    setupPuppeteer,
    getHighestMMR,
    get3s2sAverageMmr,
    getPlaylistMmr,
    calculateTeamMMR
} = require('./utils');

const distribution = {};

const log = (str) => {
    if (verbose) console.log(str);
};

const delay = (time) => {
    return new Promise(function (resolve) {
        setTimeout(resolve, time);
    });
};

const fetchDistribution = async () => {
    process.stdout.write('Fetching rank distributions ');
    const { browser, page } = await setupPuppeteer();

    await page.goto('https://rocketleague.tracker.network/rocket-league/distribution?playlist=13');
    await page.waitForXPath("//div[@class='selection']/span[contains(., 'Playlist')]");
    const [playlistDropdown] = await page.$x(
        "//div[@class='selection']/span[contains(., 'Playlist')]"
    );
    await playlistDropdown.click();
    await delay(1000);
    const [playlist3v3] = await page.$x(
        `//li[@class='dropdown__item']/span[contains(., 'Standard')]`
    );
    await playlist3v3.click();
    //await page.waitForNavigation();
    // playlist change is annoying and unreliable
    await delay(10000); //TODO: remove

    let index = 1;
    await page.waitForXPath(distributionRankNameXpath(index));

    while (index < 23) {
        let elHandle1 = await page.$x(distributionRankNameXpath(index));
        let elHandle2 = await page.$x(distributionRankMMRXpath(index));
        let rankName = await page.evaluate((el) => el.textContent, elHandle1[0]);
        let div1 = (await page.evaluate((el) => el.textContent, elHandle2[0])).split(' ')[0];
        distribution[rankNames[rankName]] = parseInt(div1.replace(',', ''));
        index++;
    }
    distribution['unranked'] = 0;
    log(distribution);
    process.stdout.write('\n');
    await browser.close();
    if (writetofile) {
        const time = Date.now();
        saveToFile(`distribution-${time}.json`, distributionToCsv(distribution));
    }
};

const estimateTime = () => {
    let c = 0;
    teamData.forEach((team) => {
        for (let i = 1; i < 6; i++) {
            if (team[`Player ${i} name`]) c++;
        }
    });
    console.log(`Estimated runtime: ${((c * 12) / 60).toFixed()} minutes`);
};

const fetchRankPuppeteer = async (profileUrl, page, waitForOptions) => {
    const ranks = {};
    try {
        await delay(12000); // 10 kutsua minuuttiin raja? 5000ms viive rikkoutui 10. pelaajan kohdalla
        await page.goto(profileUrl);
        let index = 1;
        while (index <= 9) {
            try {
                await page.waitForXPath(rankNameXpath(index), waitForOptions);
                let elHandleName = await page.$x(rankNameXpath(index));
                let elHandleMMR = await page.$x(rankMMRXpath(index));
                const name = (await page.evaluate((el) => el.textContent, elHandleName[0])).trim();
                const mmr = await page.evaluate((el) => el.textContent, elHandleMMR[0]);
                ranks[name] = parseInt(mmr.replace(',', ''));
            } catch (error) {
                // most likely not all playlists are listed for a player
                index = 9;
            }
            index++;
        }
    } catch (error) {
        process.stdout.write(`invalid profile url: '${profileUrl}' `);
    }
    return ranks;
};

const wrap = (name) => `"${name}"`;

const distributionToCsv = (dist) => {
    let str = '';
    Object.keys(dist).forEach((key) => {
        str += `${distribution[key]};${key};${distribution[key]};\n`;
    });
    return str;
};

const teamToCSV = (teams) => {
    let csvString =
        'Team Name;Captain;Reserve Captain;Top3 RMSQ;Team RMSQ;(top mmr + top3)/2;(top mmr + avg mmr)/2;Top 3 avg;Team avg;Avg Rank;P1;P1 MMR;P2;P2 MMR;P3;P3 MMR;P4;P4 MMR;P5;P5 MMR;\n';
    teams.forEach((team) => {
        let teamLine =
            wrap(team.name) +
            ';' +
            wrap(team.captainDiscord) +
            ';' +
            wrap(team.reserveCaptainDiscord) +
            ';' +
            team.mmr +
            ';;;;;;;';
        team.players.forEach((player) => {
            teamLine +=
                `=HYPERLINK("${player.profileUrl}", "${player.name}")` + ';' + player.mmr + ';';
        });
        teamLine += '\n';
        csvString += teamLine;
    });
    return csvString;
};

const getSignUpRankMmr = (player) => {
    const mmr = distribution[player.rank.toUpperCase()];
    return mmr ? mmr : distribution['unranked'];
};

async function fetchPlayerData() {
    const start = Date.now();
    const fetchedTeams = [];
    await fetchDistribution();
    const { browser, page, waitForOptions } = await setupPuppeteer();
    estimateTime();
    for (var teamIndex = 0; teamIndex < teamData.length; teamIndex++) {
        const team = teamData[teamIndex];
        const fetchedTeam = {
            name: team['Team name'],
            mmr: 0,
            captainDiscord: team['Contact Kapteenin Discord-nimimerkki'],
            reserveCaptainDiscord: team['Contact Varakapteenin Discord-nimimerkki'],
            players: []
        };
        process.stdout.write(
            `Fetching team ${teamIndex + 1}/${teamData.length} - ${fetchedTeam.name} `
        );
        for (let playerIndex = 1; playerIndex <= 5; playerIndex++) {
            const player = {
                name: '',
                profileUrl: '',
                ranks: {},
                rank: '',
                signupRankMmr: '',
                reserve: false,
                mmr: 0
            };
            player.name = team[`Player ${playerIndex} name`];
            if (player.name) {
                process.stdout.write('| ' + player.name + ' ');
                player.profileUrl = team[`Player ${playerIndex} Rocket League Tracker -profiili`];
                player.rank = team[`Player ${playerIndex} Rank / Tier`];
                player.signupRankMmr = getSignUpRankMmr(player);
                player.reserve = team[`Player ${playerIndex} Varapelaaja`] ? true : false;
                if (player.profileUrl) {
                    try {
                        player.ranks = await fetchRankPuppeteer(
                            player.profileUrl,
                            page,
                            waitForOptions
                        );
                    } catch (error) {
                        console.log(error);
                    }
                }
                if (Object.keys(player.ranks).length === 0)
                    process.stdout.write(` RATELIMIT ERROR `);
                player.mmr = getPlaylistMmr(player, playlists.standard);
                log(player);
                fetchedTeam.players.push(player);
            }
        }
        process.stdout.write('\n');
        fetchedTeam.mmr = calculateTeamMMR(fetchedTeam).toFixed();
        log(fetchedTeam);
        fetchedTeams.push(fetchedTeam);
    }
    await browser.close();
    if (writetofile) {
        const time = Date.now();
        saveToFile(`fetchedTeams-3v3-${time}.json`, JSON.stringify(fetchedTeams));
        saveToFile(`fetchedTeams-3v3-${time}.csv`, teamToCSV(fetchedTeams));

        fetchedTeams.forEach((team) => {
            team.players.forEach((player) => {
                player.mmr = get3s2sAverageMmr(player);
            });
            team.mmr = calculateTeamMMR(team).toFixed();
        });

        saveToFile(`fetchedTeams-3s2sAvg-${time}.json`, JSON.stringify(fetchedTeams));
        saveToFile(`fetchedTeams-3s2sAvg-${time}.csv`, teamToCSV(fetchedTeams));

        fetchedTeams.forEach((team) => {
            team.players.forEach((player) => {
                player.mmr = getHighestMMR(player);
            });
            team.mmr = calculateTeamMMR(team).toFixed();
        });

        saveToFile(`fetchedTeams-3s2sMax-${time}.json`, JSON.stringify(fetchedTeams));
        saveToFile(`fetchedTeams-3s2sMax-${time}.csv`, teamToCSV(fetchedTeams));
    }
    const end = Date.now();
    console.log(`Fetch finished in ${((end - start) / 60000).toFixed()} minutes`);
}

const options = commandLineArgs(optionDefinitions);
const { verbose = false, writetofile = false, signups, help } = options;
if (help || !signups) {
    const helpStr = `usage: node teams.js [--help] [--verbose] [-v] [--writetofile] [-w] <signupsfile>
        --help              show this message
        --verbose, -v       show fetched data
        --writetofile, -w   save results to file
        `;
    console.log(helpStr);
} else {
    console.log(signups);
    teamData = parseRegistrations(signups);
    fetchPlayerData();
}
