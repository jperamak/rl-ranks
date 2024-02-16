exports.rankNames = {
    'Supersonic Legend': 'SSL',
    'Grand Champion III': 'GC3',
    'Grand Champion II': 'GC2',
    'Grand Champion I': 'GC1',
    'Champion III': 'C3',
    'Champion II': 'C2',
    'Champion I': 'C1',
    'Diamond III': 'D3',
    'Diamond II': 'D2',
    'Diamond I': 'D1',
    'Platinum III': 'P3',
    'Platinum II': 'P2',
    'Platinum I': 'P1',
    'Gold III': 'G3',
    'Gold II': 'G2',
    'Gold I': 'G1',
    'Silver III': 'S3',
    'Silver II': 'S2',
    'Silver I': 'S1',
    'Bronze III': 'B3',
    'Bronze II': 'B2',
    'Bronze I': 'B1'
};

exports.playlists = {
    standard: 'Ranked Standard 3v3',
    doubles: 'Ranked Doubles 2v2',
    duel: 'Ranked Duel 1v1',
    tournament: 'Tournament Matches',
    rumble: 'Rumble',
    hoops: 'Hoops',
    snowday: 'Snowday',
    dropshot: 'Dropshot',
    unranked: 'Un-Ranked'
};

exports.optionDefinitions = [
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'signups', type: String, multiple: false, defaultOption: true },
    { name: 'writetofile', alias: 'w', type: Boolean },
    { name: 'help', type: Boolean },
    { name: 'kana', alias: 'k', type: Boolean },
    { name: 'pappa', alias: 'p', type: Boolean },
    { name: 'json', alias: 'j', type: Boolean }
];
