const commandLineArgs = require('command-line-args');
const {
    parseRegistrations,
    readPageJson,
    saveToFile,
    setupPuppeteer,
    profileUrl,
    peaksUrl
} = require('./utils');
const { optionDefinitions } = require('./constants');

const delay = (time) => {
    return new Promise(function (resolve) {
        setTimeout(resolve, time);
    });
};

const parseRow = (row, type) => {
    if (type === 'kana') {
        const team = {
            name: row['Team name'],
            captain: row['Contact Kapteenin Discord-nimimerkki'],
            reserve: row['Varakapteenin Discord-nimimerkki'],
            players: []
        };
        for (let i = 1; i < 6; i++) {
            team.players.push({
                name: row[`Player ${i} In-game nimimerkki`],
                profile: row[`Player ${i} Rocket League Tracker -profiili`],
                signupRank: row[`Player ${i} Rank / Tier`],
                reserve: row[`Player ${i} Varapelaaja`]
            });
        }
        return team;
    } else throw new Error('not implemented');
};

const parseTeams = (data, type) => {
    const teams = [];
    data.forEach((row) => {
        teams.push(parseRow(row, type));
    });
    return teams;
};

const profileRegex =
    /https:\/\/rocketleague\.tracker\.network\/rocket-league\/profile\/(xbl|steam|epic|psn|switch)\/[A-Za-z0-9]*.*/;

const validateProfiles = (teams) => {
    let invalid = false;
    teams.forEach((team) => {
        team.players.forEach((player) => {
            if (player.name)
                if (!player.profile.match(profileRegex)) {
                    console.log(`${team.name} - ${player.name} bad profle: ${player.profileUrl}`);
                    invalid = true;
                }
        });
    });
    if (invalid) process.exit(0);
};
const API_DISTRIBUTIONS = 'https://api.tracker.gg/api/v1/rocket-league/distribution/13';

const getRanks = (data, peakData) => {
    if (!data || !data.data) {
        console.log('no data');
        return {};
    }
    const playlists = data.data.segments.filter((s) => s.type === 'playlist');
    const peaks = {};
    peakData.data.forEach((peak) => (peaks[peak.metadata.name] = peak.stats.peakRating.value));
    const ranks = {};
    playlists.forEach((playlist) => {
        ranks[playlist.metadata.name] = {
            current: playlist.stats.rating.value,
            peak: peaks[playlist.metadata.name]
        };
    });
    return ranks;
};

const teamToCSV = (teams) => {
    let csvString =
        'Team Name;' +
        'Captain;' +
        'Reserve Captain;' +
        'Top3 RMSQ;' +
        'Team RMSQ;' +
        '(top mmr + top3)/2;' +
        '(top mmr + avg mmr)/2;' +
        'Top 3 avg;' +
        'Team avg;' +
        'Avg Rank;' +
        'P1;' +
        'P1 MMR;' +
        'P2;' +
        'P2 MMR;' +
        'P3;' +
        'P3 MMR;' +
        'P4;' +
        'P4 MMR;' +
        'P5;' +
        'P5 MMR;' +
        '\n';
    teams.forEach((team) => {
        let teamLine =
            wrap(team.name) +
            ';' +
            wrap(team.captain) +
            ';' +
            wrap(team.reserve) +
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

const fetchTrackerData = async (teamsInfo) => {
    // prepare puppeteer
    const { browser, page } = await setupPuppeteer();
    try {
        // get distribution data
        //const distributionRaw = await readPageJson(page, API_DISTRIBUTIONS);
        let calls = 0;
        const teams = [];
        const start = Date.now();
        for (tIdx = 0; tIdx < teamsInfo.length; tIdx++) {
            const team = teamsInfo[tIdx];
            console.log(
                `Fetching ${team.name} ${tIdx}/${teamsInfo.length} ${(Date.now() - start) / 1000}s`
            );
            const t = {
                name: team.name,
                captain: team.captain,
                reserve: team.reserve,
                players: []
            };
            for (let pIdx = 0; pIdx < 5; pIdx++) {
                const player = team.players[pIdx];
                if (!player.name) break;
                console.log(
                    `Fetching ${player.name} - calls: ${++calls} ${
                        (Date.now() - start) / 1000
                    }s passed`
                );
                const data = await readPageJson(page, profileUrl(player.profile));
                log(data);
                const peakData = await readPageJson(page, peaksUrl(player.profile));
                log(peakData);
                const p = {
                    name: player.name,
                    profile: player.profile,
                    signupRank: player.signupRank,
                    reserve: player.reserve,
                    ranks: getRanks(data, peakData)
                };
                t.players.push(p);
                // 5000ms delay -> 50 calls per 150 seconds, so 1 call per 3 seconds is too much
                await delay(10000);
            }
            //calculate some mmr?
            teams.push(t);
        }
        const time = Date.now();
        saveToFile(`output/trackerdata-${time}.json`, JSON.stringify(teams));
    } finally {
        await browser.close();
    }
};

const log = (str) => {
    if (verbose) console.log(str);
};

const debug = false;

const options = commandLineArgs(optionDefinitions);
const { verbose = false, writetofile = false, signups, help, kana, pappa } = options;
if (help || !signups || (kana && pappa)) {
    const helpStr = `usage: node teams.js [--help] [-k] [-p] [-v] [-w] <signupsfile>
        --help              show this message
        --kana, -k          kanaliiga signups style, exclusive with pappa
        --pappa, -p         pappaliiga signups style, exclusive with kana
        --verbose, -v       show fetched data
        --writetofile, -w   save results to file
        `;
    console.log(helpStr);
} else {
    if (!debug) {
        const signupsType = pappa ? 'pappa' : 'kana';
        // parse registrations
        const signupsData = parseRegistrations(signups);
        // parse teams
        const teamsInfo = parseTeams(signupsData, signupsType);
        // validate profiles (missing tracker urls)
        validateProfiles(teamsInfo);
        // fetch and save player data
        const teamsData = fetchTrackerData(teamsInfo);
    }
    //const teamsData = require('./trackerdata-1694497211387.json');
    // create gsheets
    //saveToFile(`ghseets-${time}.csv`, teamToCSV(fetchedTeams));
}
