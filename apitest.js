const commandLineArgs = require('command-line-args');
const utils = require('./utils');

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
    log(row);
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
        log(team);
        return team;
    } else if (type === 'pappa') {
        const team = {
            name: row['Team name'],
            captain: row['Contact Kapteenin Discord ID (julkinen)'],
            players: []
        };
        for (let i = 1; i < 6; i++) {
            const player = {
                name: row[`Player ${i} name`],
                profile: row[`Player ${i} RL-Tracker -profiili`],
                signupRank: row[`Player ${i} Rank 3v3 (nykyinen)`],
                reserve: row[`Player ${i} Varapelaaja`]
            };
            if (player.name) team.players.push(player);
        }
        log(team);
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

const getRanks = (data) => {
    if (!data || !data.data) {
        console.log('no data');
        return {};
    }
    const playlists = data.data.segments.filter((s) => s.type === 'playlist');
    const peakData = data.data.segments.filter((s) => s.type === 'peak-rating');
    const peaks = {};
    peakData.forEach((peak) => (peaks[peak.metadata.name] = peak.stats.peakRating.value));
    const ranks = {};
    playlists.forEach((playlist) => {
        ranks[playlist.metadata.name] = {
            current: playlist.stats.rating.value,
            peak: peaks[playlist.metadata.name]
        };
    });
    return ranks;
};

const wrap = (name) => `"${name}"`;

const teamToCSV = (teams) => {
    let csvString =
        'Team Name;' +
        'Top3 RMSQ;' +
        'Team RMSQ;' +
        '(top mmr + top3)/2;' +
        '(top mmr + avg mmr)/2;' +
        'Top 3 avg;' +
        'Team avg;' +
        'P1;' +
        'P1 MMR;' +
        'P1 Peak;' +
        'P2;' +
        'P2 MMR;' +
        'P2 Peak;' +
        'P3;' +
        'P3 MMR;' +
        'P3 Peak;' +
        'P4;' +
        'P4 MMR;' +
        'P4 Peak;' +
        'P5;' +
        'P5 MMR;' +
        'P5 Peak;' +
        '\n';
    teams.forEach((team) => {
        let teamLine = wrap(team.name) + ';' + team.mmr + ';;;;;;';
        team.players.forEach((player) => {
            teamLine += `${wrap(player.name)}` + ';' + player.mmr + ';' + player.peak + ';';
        });
        teamLine += '\n';
        csvString += teamLine;
    });
    return csvString;
};

const calculateTeamMMR = (teams, playlist) => {
    const teamsWithMmr = [];
    teams.forEach((team) => {
        const newTeam = { ...team };
        newTeam.players = team.players.map((player) => {
            log(player);
            return {
                ...player,
                mmr: player.ranks[playlist]?.current ?? 0,
                peak: player.ranks[playlist]?.peak ?? 0
            };
        });
        newTeam.mmr = utils.calculateTeamMMR(newTeam);
        teamsWithMmr.push(newTeam);
    });
    return teamsWithMmr;
};

const fetchTrackerData = async (teamsInfo) => {
    // prepare puppeteer
    const { browser, page } = await setupPuppeteer();
    const teams = [];

    try {
        // get distribution data
        // const distributionRaw = await readPageJson(page, API_DISTRIBUTIONS);
        let calls = 0;
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
                if (!player || !player.name) break;
                console.log(
                    `Fetching ${player.name} - calls: ${++calls} ${
                        (Date.now() - start) / 1000
                    }s passed`
                );
                const data = await readPageJson(page, profileUrl(player.profile));
                log(data);
                const p = {
                    name: player.name,
                    profile: player.profile,
                    signupRank: player.signupRank,
                    reserve: player.reserve,
                    ranks: getRanks(data)
                };
                t.players.push(p);
                // 1 call per 3 seconds is too often
                await delay(10000);
            }
            teams.push(t);
        }
        saveToFile(`output/trackerdata-${time}.json`, JSON.stringify(teams));
    } finally {
        await browser.close();
    }
    return teams;
};

const log = (str) => {
    if (verbose) console.log(str);
};

const debug = false;
const time = Date.now();
const options = commandLineArgs(optionDefinitions);
const { verbose = false, signups, help, kana, pappa, json } = options;

const doIt = async () => {
    if (help || !signups || (kana && pappa)) {
        const helpStr = `usage: node teams.js [--help] [-k] [-p] [-v] [-w] <signupsfile>
        --help              show this message
        --kana, -k          kanaliiga signups style, exclusive with pappa
        --pappa, -p         pappaliiga signups style, exclusive with kana
        --verbose, -v       show fetched data
        `;
        console.log(helpStr);
    } else {
        if (!debug) {
            let teamsData;
            if (!json) {
                const signupsType = pappa ? 'pappa' : 'kana';
                // parse registrations
                const signupsData = parseRegistrations(signups);
                // parse teams
                const teamsInfo = parseTeams(signupsData, signupsType);
                // validate profiles (missing tracker urls)
                validateProfiles(teamsInfo);
                // fetch and save player data
                teamsData = await fetchTrackerData(teamsInfo);
            } else {
                teamsData = require(signups);
            }
            // calculate team mmr
            const teamsWithMmr3v3 = calculateTeamMMR(teamsData, 'Ranked Standard 3v3');
            const teamsWithMmr2v2 = calculateTeamMMR(teamsData, 'Ranked Doubles 2v2');
            // create gsheets
            saveToFile(`output/gsheets-${time}-3v3.csv`, teamToCSV(teamsWithMmr3v3));
            saveToFile(`output/gsheets-${time}-2v2.csv`, teamToCSV(teamsWithMmr2v2));
        }
    }
};

doIt();
