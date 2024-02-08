const puppeteer = require('puppeteer');
const fs = require('fs');
const parse = require('csv-parse/lib/sync');
const { playlists } = require('./constants');

exports.saveToFile = (filename, data) => {
    fs.writeFile(filename, data, function (err) {
        if (err) throw err;
        console.log(`${filename} saved!`);
    });
};

exports.parseRegistrations = (file) => {
    console.log('Parsing registrations');
    const registrations = fs.readFileSync(file);
    return parse(registrations.toString(), { columns: true });
};

exports.setupPuppeteer = async () => {
    const launchOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    };
    const userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 OPR/101.0.0.0';
    const viewPort = { width: 1366, height: 768 };

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    page.setExtraHTTPHeaders({ referer: 'https://rocketleague.tracker.network/' });
    await page.setViewport(viewPort);
    await page.setUserAgent(userAgent);
    const waitForOptions = { timeout: 5000 };
    return { browser, page, waitForOptions };
};

// TODO: which playlists to use?
exports.getHighestMMR = (player) => {
    const s = player.ranks[playlists.standard];
    const d = player.ranks[playlists.doubles];
    const t = player.ranks[playlists.tournament];
    const r = player.ranks[playlists.rumble];

    if (s && d) {
        return s > d ? s : d;
    }
    return s ? s : d ? d : t ? t : r ? r : player.signupRankMmr;
};

exports.get3s2sAverageMmr = (player) => {
    const s = player.ranks[playlists.standard];
    const d = player.ranks[playlists.doubles];
    const t = player.ranks[playlists.tournament];
    const r = player.ranks[playlists.rumble];

    if (s && d) {
        return ((s + d) / 2).toFixed();
    }
    return s ? s : d ? d : t ? t : r ? r : player.signupRankMmr;
};

exports.getPlaylistMmr = (player, playlist) => {
    return player.ranks[playlist] ? player.ranks[playlist] : player.signupRankMmr;
};

// Top 3 RMSQ
exports.calculateTeamMMR = (team) => {
    const top3mmr = team.players
        .map((player) => player.mmr)
        .sort((a, b) => {
            if (a > b) return -1;
            if (a < b) return 1;
            return 0;
        })
        .splice(0, 3);
    total = 0;
    top3mmr.forEach((a) => (total += a * a));
    return Math.sqrt((1 / top3mmr.length) * total).toPrecision(4);
};

const TRACKER_URL_BASE = 'https://rocketleague.tracker.network/rocket-league/profile/';
const TRACKER_API_BASE = 'https://api.tracker.gg/api/v2/rocket-league/standard/profile/';

/**
 * @param {string} profile - player profile url
 */
const parseProfile = (profile) => {
    const parts = profile.replace(TRACKER_URL_BASE, '').split('/');
    return `${parts[0]}/${parts[1]}`;
};

exports.profileUrl = (profile) => `${TRACKER_API_BASE}${parseProfile(profile)}`;
exports.peaksUrl = (profile) => `${TRACKER_API_BASE}${parseProfile(profile)}/segments/peak-ratings`;

exports.readPageJson = async (page, url) => {
    console.log(url);
    page.setExtraHTTPHeaders({ referer: 'https://rocketleague.tracker.network/' });
    try {
        const stats = await page.goto(url);
        await page.content();
        const jsonData = await page.evaluate(() => {
            return JSON.parse(document.querySelector('body').innerText);
        });
        //console.log(jsonData);
        if (jsonData.errors) {
            console.log(`Tracker: ${jsonData.errors[0].message}`);
        }
        return jsonData;
    } catch (error) {
        console.log(url, 'error');
        return {};
    }
};
