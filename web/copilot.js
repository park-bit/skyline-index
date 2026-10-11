// Skyline Copilot - pure, DOM-free natural-language query engine.
// window.SkylineCopilot.answer(text, ctx) -> { reply, html, actions, followups, confidence, intent, entities }
// ctx = { airports, airportLookup, opportunities, intelligence?, horizon, selectedAirport, history }
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SkylineCopilot = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null), function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // 1. Static knowledge: countries (ISO2 -> name, continent, aliases/demonyms)
  // ---------------------------------------------------------------------------
  const COUNTRY_TABLE = {
    AE: ["United Arab Emirates", "AS", "uae", "emirates", "emirati"], AF: ["Afghanistan", "AS", "afghan"], AG: ["Antigua and Barbuda", "NA", "antigua"],
    AI: ["Anguilla", "NA"], AL: ["Albania", "EU", "albanian"], AM: ["Armenia", "AS", "armenian"], AO: ["Angola", "AF", "angolan"],
    AR: ["Argentina", "SA", "argentine", "argentinian"], AS: ["American Samoa", "OC"], AT: ["Austria", "EU", "austrian"],
    AU: ["Australia", "OC", "australian", "aussie", "oz"], AW: ["Aruba", "NA"], AZ: ["Azerbaijan", "AS", "azeri", "azerbaijani"],
    BA: ["Bosnia and Herzegovina", "EU", "bosnia", "bosnian"], BB: ["Barbados", "NA", "barbadian"], BD: ["Bangladesh", "AS", "bangladeshi"],
    BE: ["Belgium", "EU", "belgian"], BF: ["Burkina Faso", "AF"], BG: ["Bulgaria", "EU", "bulgarian"], BH: ["Bahrain", "AS", "bahraini"],
    BI: ["Burundi", "AF"], BJ: ["Benin", "AF"], BL: ["Saint Barthelemy", "NA", "st barts"], BM: ["Bermuda", "NA"], BN: ["Brunei", "AS"],
    BO: ["Bolivia", "SA", "bolivian"], BQ: ["Bonaire", "NA"], BR: ["Brazil", "SA", "brazilian", "brasil"], BS: ["Bahamas", "NA", "bahamian"],
    BT: ["Bhutan", "AS", "bhutanese"], BW: ["Botswana", "AF"], BY: ["Belarus", "EU", "belarusian"], BZ: ["Belize", "NA"],
    CA: ["Canada", "NA", "canadian"], CC: ["Cocos Islands", "AS"], CD: ["DR Congo", "AF", "congo kinshasa", "drc", "democratic republic of the congo", "congolese"],
    CF: ["Central African Republic", "AF"], CG: ["Republic of the Congo", "AF", "congo brazzaville"], CH: ["Switzerland", "EU", "swiss"],
    CI: ["Ivory Coast", "AF", "cote d'ivoire", "cote divoire", "ivorian"], CK: ["Cook Islands", "OC"], CL: ["Chile", "SA", "chilean"],
    CM: ["Cameroon", "AF", "cameroonian"], CN: ["China", "AS", "chinese", "prc"], CO: ["Colombia", "SA", "colombian"],
    CR: ["Costa Rica", "NA", "costa rican"], CU: ["Cuba", "NA", "cuban"], CV: ["Cape Verde", "AF", "cabo verde"], CW: ["Curacao", "NA"],
    CX: ["Christmas Island", "AS"], CY: ["Cyprus", "EU", "cypriot"], CZ: ["Czech Republic", "EU", "czechia", "czech"],
    DE: ["Germany", "EU", "german", "deutschland"], DJ: ["Djibouti", "AF"], DK: ["Denmark", "EU", "danish"], DM: ["Dominica", "NA"],
    DO: ["Dominican Republic", "NA", "dominican"], DZ: ["Algeria", "AF", "algerian"], EC: ["Ecuador", "SA", "ecuadorian"],
    EE: ["Estonia", "EU", "estonian"], EG: ["Egypt", "AF", "egyptian"], EH: ["Western Sahara", "AF"], ER: ["Eritrea", "AF"],
    ES: ["Spain", "EU", "spanish", "espana"], ET: ["Ethiopia", "AF", "ethiopian"], FI: ["Finland", "EU", "finnish"], FJ: ["Fiji", "OC", "fijian"],
    FK: ["Falkland Islands", "SA"], FM: ["Micronesia", "OC"], FO: ["Faroe Islands", "EU", "faroe"], FR: ["France", "EU", "french"],
    GA: ["Gabon", "AF"], GB: ["United Kingdom", "EU", "uk", "britain", "british", "great britain", "england", "english", "scotland", "scottish", "wales", "welsh", "u.k."],
    GD: ["Grenada", "NA"], GE: ["Georgia", "AS", "georgian"], GF: ["French Guiana", "SA"], GG: ["Guernsey", "EU"], GH: ["Ghana", "AF", "ghanaian"],
    GI: ["Gibraltar", "EU"], GL: ["Greenland", "NA"], GM: ["Gambia", "AF", "gambian"], GN: ["Guinea", "AF"], GP: ["Guadeloupe", "NA"],
    GQ: ["Equatorial Guinea", "AF"], GR: ["Greece", "EU", "greek"], GT: ["Guatemala", "NA", "guatemalan"], GU: ["Guam", "OC"],
    GW: ["Guinea-Bissau", "AF"], GY: ["Guyana", "SA"], HK: ["Hong Kong", "AS", "hongkong"], HN: ["Honduras", "NA", "honduran"],
    HR: ["Croatia", "EU", "croatian"], HT: ["Haiti", "NA", "haitian"], HU: ["Hungary", "EU", "hungarian"], ID: ["Indonesia", "AS", "indonesian"],
    IE: ["Ireland", "EU", "irish"], IL: ["Israel", "AS", "israeli"], IM: ["Isle of Man", "EU"], IN: ["India", "AS", "indian", "bharat"],
    IQ: ["Iraq", "AS", "iraqi"], IR: ["Iran", "AS", "iranian", "persia"], IS: ["Iceland", "EU", "icelandic"], IT: ["Italy", "EU", "italian"],
    JE: ["Jersey", "EU"], JM: ["Jamaica", "NA", "jamaican"], JO: ["Jordan", "AS", "jordanian"], JP: ["Japan", "AS", "japanese"],
    KE: ["Kenya", "AF", "kenyan"], KG: ["Kyrgyzstan", "AS", "kyrgyz"], KH: ["Cambodia", "AS", "cambodian"], KI: ["Kiribati", "OC"],
    KM: ["Comoros", "AF"], KN: ["Saint Kitts and Nevis", "NA", "st kitts"], KP: ["North Korea", "AS"], KR: ["South Korea", "AS", "korea", "korean"],
    KW: ["Kuwait", "AS", "kuwaiti"], KY: ["Cayman Islands", "NA", "cayman"], KZ: ["Kazakhstan", "AS", "kazakh"], LA: ["Laos", "AS", "lao"],
    LB: ["Lebanon", "AS", "lebanese"], LC: ["Saint Lucia", "NA", "st lucia"], LK: ["Sri Lanka", "AS", "sri lankan", "ceylon"],
    LR: ["Liberia", "AF"], LS: ["Lesotho", "AF"], LT: ["Lithuania", "EU", "lithuanian"], LU: ["Luxembourg", "EU"], LV: ["Latvia", "EU", "latvian"],
    LY: ["Libya", "AF", "libyan"], MA: ["Morocco", "AF", "moroccan"], MC: ["Monaco", "EU"], ME: ["Montenegro", "EU"], MF: ["Saint Martin", "NA"],
    MG: ["Madagascar", "AF", "malagasy"], MH: ["Marshall Islands", "OC"], MK: ["North Macedonia", "EU", "macedonia"], ML: ["Mali", "AF"],
    MM: ["Myanmar", "AS", "burma", "burmese"], MN: ["Mongolia", "AS", "mongolian"], MO: ["Macau", "AS", "macao"], MP: ["Northern Mariana Islands", "OC", "saipan"],
    MQ: ["Martinique", "NA"], MR: ["Mauritania", "AF"], MT: ["Malta", "EU", "maltese"], MU: ["Mauritius", "AF", "mauritian"],
    MV: ["Maldives", "AS", "maldivian"], MW: ["Malawi", "AF"], MX: ["Mexico", "NA", "mexican"], MY: ["Malaysia", "AS", "malaysian"],
    MZ: ["Mozambique", "AF"], NA: ["Namibia", "AF", "namibian"], NC: ["New Caledonia", "OC"], NE: ["Niger", "AF"], NF: ["Norfolk Island", "OC"],
    NG: ["Nigeria", "AF", "nigerian"], NI: ["Nicaragua", "NA"], NL: ["Netherlands", "EU", "dutch", "holland"], NO: ["Norway", "EU", "norwegian"],
    NP: ["Nepal", "AS", "nepali", "nepalese"], NR: ["Nauru", "OC"], NU: ["Niue", "OC"], NZ: ["New Zealand", "OC", "kiwi", "nz"],
    OM: ["Oman", "AS", "omani"], PA: ["Panama", "NA", "panamanian"], PE: ["Peru", "SA", "peruvian"], PF: ["French Polynesia", "OC", "tahiti"],
    PG: ["Papua New Guinea", "OC", "png"], PH: ["Philippines", "AS", "filipino", "philippine"], PK: ["Pakistan", "AS", "pakistani"],
    PL: ["Poland", "EU", "polish"], PM: ["Saint Pierre and Miquelon", "NA"], PR: ["Puerto Rico", "NA", "puerto rican"], PT: ["Portugal", "EU", "portuguese"],
    PW: ["Palau", "OC"], PY: ["Paraguay", "SA", "paraguayan"], QA: ["Qatar", "AS", "qatari"], RE: ["Reunion", "AF"], RO: ["Romania", "EU", "romanian"],
    RS: ["Serbia", "EU", "serbian"], RU: ["Russia", "EU", "russian", "russian federation"], RW: ["Rwanda", "AF", "rwandan"],
    SA: ["Saudi Arabia", "AS", "saudi", "ksa"], SB: ["Solomon Islands", "OC"], SC: ["Seychelles", "AF"], SD: ["Sudan", "AF", "sudanese"],
    SE: ["Sweden", "EU", "swedish"], SG: ["Singapore", "AS", "singaporean"], SI: ["Slovenia", "EU", "slovenian"], SK: ["Slovakia", "EU", "slovak"],
    SL: ["Sierra Leone", "AF"], SN: ["Senegal", "AF", "senegalese"], SO: ["Somalia", "AF", "somali"], SR: ["Suriname", "SA"],
    SS: ["South Sudan", "AF"], ST: ["Sao Tome and Principe", "AF", "sao tome"], SV: ["El Salvador", "NA", "salvadoran"], SX: ["Sint Maarten", "NA"],
    SZ: ["Eswatini", "AF", "swaziland"], TC: ["Turks and Caicos", "NA"], TD: ["Chad", "AF"], TG: ["Togo", "AF"], TH: ["Thailand", "AS", "thai"],
    TJ: ["Tajikistan", "AS", "tajik"], TL: ["Timor-Leste", "AS", "east timor"], TM: ["Turkmenistan", "AS"], TN: ["Tunisia", "AF", "tunisian"],
    TO: ["Tonga", "OC"], TR: ["Turkey", "AS", "turkiye", "turkish"], TT: ["Trinidad and Tobago", "NA", "trinidad"], TV: ["Tuvalu", "OC"],
    TW: ["Taiwan", "AS", "taiwanese"], TZ: ["Tanzania", "AF", "tanzanian"], UA: ["Ukraine", "EU", "ukrainian"], UG: ["Uganda", "AF", "ugandan"],
    US: ["United States", "NA", "usa", "us", "america", "american", "u.s.", "u.s.a.", "united states of america", "states"],
    UY: ["Uruguay", "SA", "uruguayan"], UZ: ["Uzbekistan", "AS", "uzbek"], VC: ["Saint Vincent and the Grenadines", "NA", "st vincent"],
    VE: ["Venezuela", "SA", "venezuelan"], VG: ["British Virgin Islands", "NA"], VI: ["US Virgin Islands", "NA", "virgin islands"],
    VN: ["Vietnam", "AS", "vietnamese", "viet nam"], VU: ["Vanuatu", "OC"], WF: ["Wallis and Futuna", "OC"], WS: ["Samoa", "OC", "samoan"],
    XK: ["Kosovo", "EU"], YE: ["Yemen", "AS", "yemeni"], YT: ["Mayotte", "AF"], ZA: ["South Africa", "AF", "south african"],
    ZM: ["Zambia", "AF", "zambian"], ZW: ["Zimbabwe", "AF", "zimbabwean"],
  };

  const CONTINENT_NAMES = { AS: "Asia", EU: "Europe", NA: "North America", SA: "South America", AF: "Africa", OC: "Oceania", AN: "Antarctica" };

  // Regions: name -> { aliases, continents? | countries? }
  const REGION_TABLE = {
    asia: { aliases: ["asia", "asian"], continents: ["AS"] },
    europe: { aliases: ["europe", "european", "eu"], continents: ["EU"] },
    africa: { aliases: ["africa", "african"], continents: ["AF"] },
    north_america: { aliases: ["north america", "north american"], continents: ["NA"] },
    south_america: { aliases: ["south america", "south american"], continents: ["SA"] },
    oceania: { aliases: ["oceania", "australasia", "pacific"], continents: ["OC"] },
    americas: { aliases: ["americas", "the americas"], continents: ["NA", "SA"] },
    middle_east: { aliases: ["middle east", "middle eastern", "mideast", "west asia", "western asia"], countries: ["AE", "SA", "QA", "BH", "KW", "OM", "IR", "IQ", "IL", "JO", "LB", "SY", "YE", "TR", "EG", "PS"] },
    gulf: { aliases: ["gulf", "gcc", "gulf states", "persian gulf", "arabian gulf"], countries: ["AE", "SA", "QA", "BH", "KW", "OM"] },
    south_asia: { aliases: ["south asia", "south asian", "indian subcontinent", "subcontinent"], countries: ["IN", "PK", "BD", "LK", "NP", "BT", "MV", "AF"] },
    southeast_asia: { aliases: ["southeast asia", "south east asia", "south-east asia", "asean", "southeast asian"], countries: ["SG", "MY", "TH", "ID", "PH", "VN", "KH", "LA", "MM", "BN", "TL"] },
    east_asia: { aliases: ["east asia", "east asian", "far east", "northeast asia"], countries: ["CN", "JP", "KR", "KP", "TW", "HK", "MO", "MN"] },
    central_asia: { aliases: ["central asia", "central asian", "the stans"], countries: ["KZ", "UZ", "KG", "TJ", "TM"] },
    latin_america: { aliases: ["latin america", "latam", "latin american"], countries: ["MX", "GT", "HN", "SV", "NI", "CR", "PA", "CU", "DO", "HT", "PR", "CO", "VE", "EC", "PE", "BO", "BR", "PY", "UY", "AR", "CL", "GY", "SR", "GF"] },
    caribbean: { aliases: ["caribbean", "west indies"], countries: ["AG", "AI", "AW", "BB", "BL", "BM", "BQ", "BS", "CU", "CW", "DM", "DO", "GD", "GP", "HT", "JM", "KN", "KY", "LC", "MF", "MQ", "PR", "SX", "TC", "TT", "VC", "VG", "VI"] },
    central_america: { aliases: ["central america", "central american"], countries: ["GT", "HN", "SV", "NI", "CR", "PA", "BZ"] },
    nordics: { aliases: ["nordics", "nordic", "scandinavia", "scandinavian"], countries: ["DK", "SE", "NO", "FI", "IS", "FO"] },
    western_europe: { aliases: ["western europe", "west europe"], countries: ["GB", "IE", "FR", "DE", "NL", "BE", "LU", "CH", "AT", "ES", "PT", "IT"] },
    eastern_europe: { aliases: ["eastern europe", "east europe", "cee"], countries: ["PL", "CZ", "SK", "HU", "RO", "BG", "UA", "BY", "RU", "MD", "LT", "LV", "EE"] },
    balkans: { aliases: ["balkans", "balkan"], countries: ["AL", "BA", "BG", "HR", "XK", "ME", "MK", "RS", "SI", "GR", "RO"] },
    iberia: { aliases: ["iberia", "iberian"], countries: ["ES", "PT"] },
    benelux: { aliases: ["benelux"], countries: ["BE", "NL", "LU"] },
    north_africa: { aliases: ["north africa", "maghreb", "north african"], countries: ["MA", "DZ", "TN", "LY", "EG", "SD", "EH", "MR"] },
    sub_saharan_africa: { aliases: ["sub-saharan africa", "sub saharan africa", "subsaharan africa"], continents: ["AF"], exclude: ["MA", "DZ", "TN", "LY", "EG", "EH"] },
    east_africa: { aliases: ["east africa", "east african"], countries: ["KE", "TZ", "UG", "RW", "BI", "ET", "ER", "DJ", "SO", "SS", "MG", "MU", "SC", "KM", "RE", "YT"] },
    west_africa: { aliases: ["west africa", "west african"], countries: ["NG", "GH", "CI", "SN", "ML", "BF", "NE", "TG", "BJ", "GN", "GW", "SL", "LR", "GM", "CV", "MR"] },
    southern_africa: { aliases: ["southern africa"], countries: ["ZA", "NA", "BW", "ZW", "ZM", "MZ", "MW", "LS", "SZ", "AO"] },
    anz: { aliases: ["australia and new zealand", "anz", "down under"], countries: ["AU", "NZ"] },
    brics: { aliases: ["brics"], countries: ["BR", "RU", "IN", "CN", "ZA"] },
    g7: { aliases: ["g7"], countries: ["US", "CA", "GB", "FR", "DE", "IT", "JP"] },
    world: { aliases: ["world", "worldwide", "global", "globally", "planet", "everywhere", "all countries"], continents: ["AS", "EU", "NA", "SA", "AF", "OC", "AN"] },
  };

  const CLASS_LABELS = { established_hub: "Established hub", emerging: "Emerging", stable: "Stable", declining: "Declining" };
  const CLASS_ALIASES = {
    emerging: ["emerging", "rising", "riser", "risers", "growing", "growth", "grow", "grows", "up and coming", "upcoming", "booming", "fastest growing", "fast growing", "improving", "gainers", "winners"],
    declining: ["declining", "decline", "falling", "fallers", "faller", "shrinking", "losing", "losers", "dropping", "weakening", "worst", "struggling", "decreasing"],
    established_hub: ["hub", "hubs", "established hub", "established hubs", "established", "major", "largest", "biggest", "most connected", "best connected", "mega hub", "megahubs", "mega hubs", "top airports", "most important", "busiest"],
    stable: ["stable", "steady", "flat", "unchanged"],
  };

  const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12, fifteen: 15, twenty: 20, twentyfive: 25, thirty: 30, fifty: 50, hundred: 100 };

  const DRIVER_HUMAN = {
    "high national income per capita": "a wealthy domestic market",
    "high baseline passenger throughput": "large existing passenger volumes",
    "extensive route network connectivity": "a dense route network",
    "downward five year rank trajectory": "a weakening five-year rank trend",
    "lower baseline importance percentile": "a low starting importance percentile",
    "sluggish national economy": "a sluggish national economy",
  };

  const CITY_ALIASES = {
    delhi: "DEL",
    "new delhi": "DEL",
    mumbai: "BOM",
    bombay: "BOM",
    bangalore: "BLR",
    bengaluru: "BLR",
    calcutta: "CCU",
    kolkata: "CCU",
    madras: "MAA",
    chennai: "MAA",
    peking: "PEK",
    beijing: "PEK",
    saigon: "SGN",
    "ho chi minh": "SGN",
    "ho chi minh city": "SGN",
    canton: "CAN",
    guangzhou: "CAN",
    tokyo: "HND",
    london: "LHR",
    paris: "CDG",
    "new york": "JFK",
    nyc: "JFK",
    chicago: "ORD",
    "san francisco": "SFO",
    "los angeles": "LAX",
    dubai: "DXB",
    singapore: "SIN",
    frankfurt: "FRA",
    amsterdam: "AMS",
    seoul: "ICN",
    bangkok: "BKK",
    jakarta: "CGK",
    "kuala lumpur": "KUL",
    hyderabad: "HYD",
    ahmedabad: "AMD",
    cochin: "COK",
    kochi: "COK",
    pune: "PNQ",
    goa: "GOI",
    sydney: "SYD",
    melbourne: "MEL",
    toronto: "YYZ",
    madrid: "MAD",
    barcelona: "BCN",
    rome: "FCO",
    istanbul: "IST",
    doha: "DOH",
    riyadh: "RUH",
    jeddah: "JED",
    cairo: "CAI",
    johannesburg: "JNB",
    nairobi: "NBO",
    "sao paulo": "GRU",
    "buenos aires": "EZE",
  };

  // ---------------------------------------------------------------------------
  // 2. Utilities
  // ---------------------------------------------------------------------------
  function levenshtein(s1, s2) {
    const a = String(s1).toLowerCase(), b = String(s2).toLowerCase();
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      const t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function f1(n) { return (n == null || isNaN(n)) ? "n/a" : (Math.round(Number(n) * 10) / 10).toFixed(1); }
  function signed(n) { const v = Math.round(Number(n) * 10) / 10; return (v > 0 ? "+" : "") + v.toFixed(1); }
  function titleCase(s) { return String(s).replace(/\b\w/g, (c) => c.toUpperCase()); }
  function uniq(arr) { return Array.from(new Set(arr)); }
  function cityOf(ap) { return ap.city || ap.name || ap.iata; }
  function label(ap) { return `${cityOf(ap)} (${ap.iata})`; }

  // Horizon helpers. Horizon-10 values honour ctx.h10Mode ('damped' default | 'raw'),
  // mirroring window.SKYLINE_H10_MODE / window.getH10 in app.js.
  let h10Mode = "damped";
  let h10Alpha = null;
  function useDamped() { return h10Mode !== "raw"; }
  function h10ModeLabel() { return useDamped() ? `damped${h10Alpha != null ? ` α=${h10Alpha}` : " α"}` : "raw ensemble"; }
  function h10Footnote() { return useDamped() ? `2035 values are damped (α${h10Alpha != null ? "=" + h10Alpha : ""}) horizon-10 forecasts` : "2035 values are raw ensemble (undamped) horizon-10 forecasts"; }
  function levelAt(ap, h) {
    if (!ap) return 0;
    if (h === "present" || !h) return ap.importance_present || 0;
    const f = h === "h5" ? ap.forecast_h5 : ap.forecast_h10;
    if (!f) return ap.importance_present || 0;
    if (h === "h10" && useDamped() && f.level_damped != null) return f.level_damped;
    return f.level != null ? f.level : (ap.importance_present || 0);
  }
  function changeAt(ap, h) {
    if (!ap || h === "present" || !h) return 0;
    const f = h === "h5" ? ap.forecast_h5 : ap.forecast_h10;
    if (!f) return 0;
    if (h === "h10" && useDamped() && f.change_damped != null) return f.change_damped;
    return f.change != null ? f.change : (levelAt(ap, h) - (ap.importance_present || 0));
  }
  function classAt(ap, h) {
    if (!ap) return "stable";
    const f = (h === "h10" ? ap.forecast_h10 : ap.forecast_h5) || ap.forecast_h5 || ap.forecast_h10;
    return f && f.class ? f.class : "stable";
  }
  function horizonLabel(h) { return h === "h5" ? "2030 (+5y)" : h === "h10" ? "2035 (+10y)" : "today (2025)"; }
  function horizonYear(h) { return h === "h5" ? "2030" : h === "h10" ? "2035" : "2025"; }
  function fcAt(ap, h) { return h === "h10" ? ap.forecast_h10 : ap.forecast_h5; }

  // ---------------------------------------------------------------------------
  // 3. Context preparation (cached per airports array identity)
  // ---------------------------------------------------------------------------
  let cache = { key: null, idx: null };

  function buildIndex(ctx) {
    const airports = ctx.airports || [];
    const intel = ctx.intelligence || null;
    if (cache.key === airports && cache.idx && cache.idx.intel === intel) return cache.idx;

    const lookup = ctx.airportLookup && Object.keys(ctx.airportLookup).length ? ctx.airportLookup : {};
    if (!Object.keys(lookup).length) airports.forEach((a) => { lookup[a.iata] = a; });

    // Country names: built-in table + intelligence.country_names
    const countryName = {};
    Object.keys(COUNTRY_TABLE).forEach((k) => { countryName[k] = COUNTRY_TABLE[k][0]; });
    if (intel && intel.country_names) Object.assign(countryName, intel.country_names);

    // Alias -> ISO2 (lower-case)
    const aliasToIso = {};
    Object.keys(COUNTRY_TABLE).forEach((k) => {
      const [name, , ...aliases] = COUNTRY_TABLE[k];
      aliasToIso[name.toLowerCase()] = k;
      aliases.forEach((al) => { aliasToIso[al.toLowerCase()] = k; });
      aliasToIso[k.toLowerCase()] = k; // allow bare ISO codes like "IN"? too noisy for 2-letter words; handled separately
    });
    if (intel && intel.country_names) Object.keys(intel.country_names).forEach((k) => { aliasToIso[String(intel.country_names[k]).toLowerCase()] = k; });

    // Continent per country
    const countryContinent = {};
    Object.keys(COUNTRY_TABLE).forEach((k) => { countryContinent[k] = COUNTRY_TABLE[k][1]; });
    if (intel && intel.countries) intel.countries.forEach((c) => { if (c.continent) countryContinent[c.iso2] = c.continent; });

    const continentOf = (ap) => ap.continent || (intel && intel.airport_continent && intel.airport_continent[ap.iata]) || countryContinent[ap.country] || "??";

    // Country -> airports
    const byCountry = {};
    airports.forEach((a) => { (byCountry[a.country] = byCountry[a.country] || []).push(a); });

    // Graph adjacency (undirected)
    const adj = {};
    airports.forEach((a) => {
      if (!a.routes) return;
      a.routes.forEach((d) => {
        if (!lookup[d]) return;
        (adj[a.iata] = adj[a.iata] || new Set()).add(d);
        (adj[d] = adj[d] || new Set()).add(a.iata);
      });
    });

    // City tokens for entity extraction: list of {text, iata, kind}
    const nameEntries = [];
    airports.forEach((a) => {
      if (a.city) {
        nameEntries.push({ text: a.city.toLowerCase(), ap: a, kind: "city" });
        const cityTokens = a.city.toLowerCase().split(/[\s,/-]+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t));
        cityTokens.forEach((tk) => {
          nameEntries.push({ text: tk, ap: a, kind: "city" });
        });
      }
      if (a.name) nameEntries.push({ text: a.name.toLowerCase().replace(/\s+(international\s+)?airport$/, ""), ap: a, kind: "name" });
    });

    const idx = { airports, lookup, intel, countryName, aliasToIso, countryContinent, continentOf, byCountry, adj, nameEntries };
    cache = { key: airports, idx };
    return idx;
  }

  // Breadth-first shortest path on the routes graph
  function shortestPath(idx, from, to, exclude) {
    if (from === to) return [from];
    const adj = idx.adj;
    const prev = { [from]: null };
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      const nbrs = adj[cur];
      if (!nbrs) continue;
      for (const n of nbrs) {
        if (n in prev || (exclude && exclude === n)) continue;
        prev[n] = cur;
        if (n === to) {
          const path = [to];
          let p = cur;
          while (p != null) { path.unshift(p); p = prev[p]; }
          return path;
        }
        queue.push(n);
      }
    }
    return null;
  }

  // Reachable set size from a seed (optionally excluding a node)
  function reachCount(idx, seed, exclude) {
    const adj = idx.adj;
    const seen = new Set([seed]);
    const q = [seed];
    while (q.length) {
      const c = q.shift();
      const nb = adj[c];
      if (!nb) continue;
      for (const n of nb) { if (n === exclude || seen.has(n)) continue; seen.add(n); q.push(n); }
    }
    return seen.size;
  }

  // Client-side resilience: removal impact of an airport
  function removalImpact(idx, iata) {
    const r = idx.intel && idx.intel.resilience && idx.intel.resilience.airports;
    if (r) {
      const row = r.find((x) => x.iata === iata);
      if (row) return { source: "intelligence", reachLossPct: row.removal_reach_loss_pct, disconnected: row.removal_disconnected_airports, articulation: row.is_articulation_point, redundancy: row.redundancy_score, vulnerability: row.vulnerability_class, deps: row.top_dependencies || [], hhi: row.dependency_hhi };
    }
    const adj = idx.adj;
    if (!adj[iata]) return { source: "client", reachLossPct: 0, disconnected: 0, degree: 0, deps: [] };
    const degree = adj[iata].size;
    // Pick a reference node (highest-degree neighbour) to measure component size before/after
    let ref = null, best = -1;
    adj[iata].forEach((n) => { const d = adj[n] ? adj[n].size : 0; if (d > best) { best = d; ref = n; } });
    const before = reachCount(idx, ref, null); // includes iata
    const after = reachCount(idx, ref, iata);
    const disconnected = Math.max(0, before - 1 - after);
    // Neighbours that have no other links (single-dependency spokes)
    const strandedList = [];
    adj[iata].forEach((n) => { if (adj[n] && adj[n].size === 1) strandedList.push(n); });
    // Pair-based proxy: fraction of pairs anchored to disconnected airports
    const nodesAll = Object.keys(adj).length;
    const reachLossPct = nodesAll > 1 ? (100 * (disconnected * (nodesAll - 1 - disconnected) + (disconnected * (disconnected - 1)) / 2)) / ((nodesAll - 1) * (nodesAll - 2) / 2) : 0;
    // Dependency: among neighbours, how much of their degree is this airport? top 3 by share
    const deps = [];
    adj[iata].forEach((n) => { deps.push({ iata: n, share: 1 / (adj[n] ? adj[n].size : 1) }); });
    deps.sort((a, b) => b.share - a.share);
    return { source: "client", reachLossPct, disconnected, degree, articulation: disconnected > 0, strandedList, deps: deps.slice(0, 3) };
  }

  // ---------------------------------------------------------------------------
  // 4. Normalisation + entity extraction
  // ---------------------------------------------------------------------------
  function normalise(text) {
    let t = String(text || "").trim();
    t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    t = t.replace(/→|->|=>|-->/g, " to ");
    t = t.replace(/\bvs\.?\b|\bversus\b/gi, " vs ");
    t = t.replace(/[?!.;:]+$/g, "");
    t = t.replace(/\s+/g, " ").trim();
    const lower = t.toLowerCase().replace(/^\s*(hey|hi|ok|okay|yo)\s+(skyline|copilot|assistant)[,\s]*/i, "").replace(/^(please|pls|kindly)\s+/, "").replace(/\s+(please|pls)$/, "");
    const tokens = lower.replace(/[^a-z0-9+'\- ]/g, " ").split(/\s+/).filter(Boolean);
    return { raw: t, lower, tokens };
  }

  const STOPWORDS = new Set(["the", "a", "an", "of", "in", "at", "for", "to", "from", "and", "or", "by", "on", "with", "me", "my", "i", "is", "are", "will", "be", "what", "which", "who", "how", "where", "when", "why", "show", "tell", "about", "airport", "airports", "please", "can", "you", "do", "does", "it", "its", "that", "this", "there", "most", "top", "best", "biggest", "largest", "grow", "growing", "growth", "year", "years", "compare", "between", "vs", "route", "routes", "flight", "flights", "direct", "fly", "flies", "map", "into", "than", "more", "less", "much", "many", "much", "all", "any", "some", "now", "today", "current", "like", "want", "see", "look", "get", "go", "take", "open", "find", "give", "list", "rank", "ranked", "ranking", "score", "scores", "out", "up", "down", "over", "under", "next", "decade", "so", "very", "should", "would", "could", "if", "closes", "closed", "close", "happens", "happen", "hub", "hubs", "emerging", "declining", "stable", "established", "rising", "falling", "country", "countries", "region", "regions", "importance", "index", "forecast", "forecasts", "class", "data", "quality", "confidence", "big", "small", "new", "old", "us"]);

  function extractHorizon(lower, tokens) {
    if (/\b(2035|\+\s?10|ten years|10 years|10y|10-year|decade|next ten|plus ten|long term|long-term|h10)\b/.test(lower)) return "h10";
    if (/\b(2030|\+\s?5|five years|5 years|5y|5-year|half decade|plus five|medium term|h5)\b/.test(lower)) return "h5";
    if (/\b(2025|today|now|current|currently|present|baseline|right now|as of now|h0)\b/.test(lower)) return "present";
    return null;
  }

  function extractNumber(lower) {
    let m = lower.match(/\b(?:top|first|best|worst|largest|biggest|leading|list|show)\s+(\d{1,3})\b/);
    if (m) return Math.max(1, Math.min(100, parseInt(m[1], 10)));
    m = lower.match(/\b(\d{1,3})\s+(?:airports|hubs|cities|risers|fallers|emerging|declining|biggest|largest|most|top|fastest|best)\b/);
    if (m) return Math.max(1, Math.min(100, parseInt(m[1], 10)));
    for (const w of Object.keys(NUMBER_WORDS)) {
      if (new RegExp(`\\b(?:top|first|best|worst|largest|biggest)\\s+${w}\\b`).test(lower) || new RegExp(`\\b${w}\\s+(?:airports|hubs|risers|fallers|cities)\\b`).test(lower)) return NUMBER_WORDS[w];
    }
    return null;
  }

  function extractClasses(lower) {
    const found = [];
    Object.keys(CLASS_ALIASES).forEach((cls) => {
      for (const al of CLASS_ALIASES[cls]) {
        if (new RegExp(`\\b${al.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`).test(lower)) { found.push({ cls, alias: al }); break; }
      }
    });
    return found;
  }

  function extractRegions(idx, lower) {
    const out = [];
    Object.keys(REGION_TABLE).forEach((key) => {
      const r = REGION_TABLE[key];
      for (const al of r.aliases) {
        const re = new RegExp(`(^|[^a-z])${al.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(s|n)?(?=$|[^a-z])`);
        if (re.test(lower)) { out.push({ key, alias: al, name: titleCase(key.replace(/_/g, " ")) }); break; }
      }
    });
    // Resolve sub-region before super-region conflicts, e.g. "south asia" also matches "asia"
    const filtered = out.filter((r) => !out.some((o) => o !== r && o.alias.length > r.alias.length && o.alias.includes(r.alias)));
    return filtered;
  }

  function regionCountrySet(idx, regionKey) {
    const r = REGION_TABLE[regionKey];
    if (!r) return new Set();
    const set = new Set();
    if (r.countries) r.countries.forEach((c) => set.add(c));
    if (r.continents) {
      Object.keys(idx.countryContinent).forEach((c) => { if (r.continents.includes(idx.countryContinent[c])) set.add(c); });
      if (idx.intel && idx.intel.airport_continent) {
        Object.keys(idx.byCountry).forEach((c) => {
          const sample = idx.byCountry[c][0];
          if (sample && r.continents.includes(idx.continentOf(sample))) set.add(c);
        });
      }
    }
    if (r.exclude) r.exclude.forEach((c) => set.delete(c));
    return set;
  }

  function extractCountries(idx, lower, regions) {
    const found = [];
    const aliases = Object.keys(idx.aliasToIso).filter((a) => a.length >= 3 || a === "uk" || a === "us" || a === "nz");
    // Longest aliases first so "south africa" wins over "africa"-like substrings in country names
    aliases.sort((a, b) => b.length - a.length);
    let consumed = lower;
    for (const al of aliases) {
      if (al === "us" && !/\b(the us|in us|us airports|of us|us hubs)\b/.test(lower)) continue; // avoid pronoun "us"
      if (al === "georgia" && /\batlanta\b/.test(lower)) continue;
      const re = new RegExp(`(^|[^a-z])${al.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}('s)?(?=$|[^a-z])`);
      const m = consumed.match(re);
      if (m) {
        const iso = idx.aliasToIso[al];
        if (!found.some((f) => f.iso === iso)) found.push({ iso, alias: al, name: idx.countryName[iso] || iso });
        consumed = consumed.replace(re, "$1 ");
      }
    }
    // Avoid region/country double counting: "asia" is not a country, fine. "europe" aliases "eu" also matched as region.
    return found;
  }

  function buildReservedVocab() {
    const set = new Set();
    const add = (str) => String(str).toLowerCase().split(/[^a-z]+/).forEach((w) => { if (w.length >= 3) set.add(w); });
    INTENT_RULES.forEach((r) => r.patterns.forEach(([re]) => add(re.source)));
    Object.values(CLASS_ALIASES).forEach((l) => l.forEach(add));
    Object.values(REGION_TABLE).forEach((r) => r.aliases.forEach(add));
    Object.values(COUNTRY_TABLE).forEach((c) => { add(c[0]); c.slice(2).forEach(add); });
    ["hello", "thanks", "stats", "statistics", "weather", "risers", "fallers", "reset", "closes", "faster", "slower", "grows", "overtake", "airport", "airports", "flight", "flights", "route", "routes", "gdp", "tourism", "population", "candidates", "picks", "opportunities", "investor", "scenario", "network", "critical", "fragile", "horizon", "years", "decade", "country", "countries", "region", "regions", "biggest", "largest", "fastest", "growing", "emerging", "declining", "stable", "hubs", "connected", "compare", "between", "direct", "nonstop", "copilot", "skyline", "please", "about", "which", "where", "what", "there", "their", "these", "those", "world", "worldwide", "global", "today", "forecast", "forecasts", "importance", "score", "scores", "confident", "confidence", "uncertainty", "method", "methodology", "model", "sources", "mean", "means", "define", "explain", "ranking", "rankings", "ranked", "rank", "overview", "summary", "aviation", "market", "markets", "airline", "airlines", "travel", "destinations", "destination", "flying", "going", "happens", "happen", "would", "should", "could", "closed", "closure", "removed", "offline", "shut", "filter", "filters", "only", "zoom", "switch", "open", "show", "draw", "highlight", "clear", "help", "commands", "example", "examples"].forEach(add);
    return set;
  }

  function extractAirports(idx, raw, lower, tokens, countriesFound) {
    const found = [];
    const seen = new Set();
    const push = (ap, via, pos, conf) => { if (ap && !seen.has(ap.iata)) { seen.add(ap.iata); found.push({ ap, via, pos, conf }); } };

    // 1. IATA codes: uppercase 3-letter in raw, or any 3-letter token that is a known code (lower-case allowed)
    const rawTokens = raw.split(/[^A-Za-z]+/).filter(Boolean);
    rawTokens.forEach((tk, i) => {
      if (tk.length === 3 && /^[A-Z]{3}$/.test(tk) && idx.lookup[tk]) push(idx.lookup[tk], "iata", raw.indexOf(tk), 1.0);
    });
    const ambiguousWords = new Set(["the", "and", "for", "top", "ten", "now", "how", "are", "can", "you", "its", "all", "any", "not", "but", "via", "per", "get", "set", "see", "new", "big", "out", "who", "why", "yes", "nor", "may", "one", "two", "six", "has", "had", "was", "did", "end", "far", "few", "own", "say", "use", "way", "let", "put", "run", "add", "ask", "day", "lot", "map", "sin"]);
    tokens.forEach((tk) => {
      if (tk.length === 3 && !ambiguousWords.has(tk)) {
        const up = tk.toUpperCase();
        if (idx.lookup[up]) push(idx.lookup[up], "iata", lower.indexOf(tk), 0.85);
      }
    });
    // "sin" allowed if raw contains "SIN" (handled) or phrased like "sin airport"/"compare sin"
    if (/\b(sin)\b/.test(lower) && !seen.has("SIN") && /\b(sin airport|compare sin|sin and|and sin|sin vs|vs sin|show sin|to sin|from sin|sin to|about sin|is sin|sin or|or sin)\b/.test(lower) && idx.lookup.SIN) push(idx.lookup.SIN, "iata", lower.indexOf("sin"), 0.8);

    // 2. City / name phrase matches (longest match first), skipping country words
    const countryWords = new Set();
    (countriesFound || []).forEach((c) => c.alias.split(/\s+/).forEach((w) => countryWords.add(w)));
    const words = lower.replace(/[^a-z0-9' \-]/g, " ").split(/\s+/).filter(Boolean);
    const taken = new Array(words.length).fill(false);
    const cityMap = idx._cityMap || (idx._cityMap = (() => {
      const m = new Map();
      idx.nameEntries.forEach((e) => {
        const key = e.text.replace(/[^a-z0-9' \-]/g, " ").replace(/\s+/g, " ").trim();
        if (!key) return;
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(e);
      });
      return m;
    })());
    for (let len = 4; len >= 1; len--) {
      for (let i = 0; i + len <= words.length; i++) {
        if (taken.slice(i, i + len).some(Boolean)) continue;
        const phrase = words.slice(i, i + len).join(" ");
        if (CITY_ALIASES[phrase] && idx.lookup[CITY_ALIASES[phrase]]) {
          const ap = idx.lookup[CITY_ALIASES[phrase]];
          push(ap, "alias", lower.indexOf(phrase), 0.95);
          for (let k = i; k < i + len; k++) taken[k] = true;
          continue;
        }
        if (len === 1 && (STOPWORDS.has(phrase) || phrase.length < 4 || countryWords.has(phrase))) continue;
        if (countryWords.has(phrase)) continue;
        const entries = cityMap.get(phrase);
        if (entries && entries.length) {
          const sorted = entries.slice().sort((a, b) => (b.ap.importance_present || 0) - (a.ap.importance_present || 0));
          const cityHits = sorted.filter((e) => e.kind === "city");
          const alts = uniq((cityHits.length ? cityHits : sorted).map((e) => e.ap.iata));
          const ap = (cityHits[0] || sorted[0]).ap;
          push(ap, "city", lower.indexOf(phrase), cityHits.length ? 0.9 : 0.8);
          if (alts.length > 1) found[found.length - 1].alternatives = alts.slice(0, 4);
          for (let k = i; k < i + len; k++) taken[k] = true;
        }
      }
    }
    // 3. Typo tolerance on remaining single words (len >= 5) against city tokens
    const RESERVED = idx._reserved || (idx._reserved = buildReservedVocab());
    const looksLikeLookup = /^(show|find|open|go to|goto|take me to|zoom to|fly to|locate|where is|where's|where does|select|look up|lookup|compare|tell me about|what about|how about|why is|is|does|radar for|routes from|rank of)\b/.test(lower) || words.length <= 2;
    if (found.length === 0 && looksLikeLookup) {
      words.forEach((w, i) => {
        if (taken[i] || w.length < 5 || STOPWORDS.has(w) || countryWords.has(w) || RESERVED.has(w)) return;
        let best = null, bestD = w.length <= 6 ? 2 : 3;
        idx.nameEntries.forEach((e) => {
          if (e.kind !== "city") return;
          const tokensC = e.text.split(/[\s,/-]+/);
          for (const ct of tokensC) {
            if (ct.length < 4 || Math.abs(ct.length - w.length) > 2) continue;
            const d = levenshtein(w, ct);
            if (d < bestD || (d === bestD && best && (e.ap.importance_present || 0) > (best.importance_present || 0))) { bestD = d; best = e.ap; }
          }
        });
        if (best && bestD <= (w.length <= 6 ? 1 : 2)) push(best, "fuzzy", lower.indexOf(w), 0.6);
      });
    }
    found.sort((a, b) => a.pos - b.pos);
    return found;
  }

  function extractEntities(idx, norm, ctx) {
    const { raw, lower, tokens } = norm;
    const regions = extractRegions(idx, lower);
    const countries = extractCountries(idx, lower, regions);
    const airports = extractAirports(idx, raw, lower, tokens, countries);
    const horizon = extractHorizon(lower, tokens);
    const n = extractNumber(lower);
    const classes = extractClasses(lower);
    // Pronoun / follow-up references
    const refersToSelected = /\b(it|its|this airport|that airport|this one|that one|here|there|the airport|same airport)\b/.test(lower);
    return { regions, countries, airports, horizon, n, classes, refersToSelected };
  }

  // ---------------------------------------------------------------------------
  // 5. Intent classification: weighted keyword/pattern scoring
  // ---------------------------------------------------------------------------
  const INTENT_RULES = [
    { intent: "greeting", patterns: [[/^(hi|hello|hey|yo|hiya|good (morning|afternoon|evening)|howdy|sup|what's up|whats up)\b/, 6], [/^(thanks|thank you|thx|cheers|great|awesome|cool|nice|ok|okay)\b/, 5], [/\b(who are you|what are you|your name)\b/, 5]] },
    { intent: "help", patterns: [[/^(help|\?|commands?|menu|options)$/, 8], [/\b(what can you do|what can i ask|how do i use|help me|show commands|capabilities|what do you know)\b/, 6], [/\bexamples?\b/, 3]] },
    { intent: "methodology", patterns: [[/\b(how (is|are|do you|does|was) .*(comput|calculat|built|model|score|forecast|predict|derived|made|work))/, 6], [/\b(methodology|method|model|algorithm|lightgbm|ridge|ensemble|training|features?|data sources?|dataset|openflights|opensky|where does the data come from|source of (the )?data|how accurate|accuracy|mae|validation|auc|limitations?|caveats?|damped|damping|shrinkage|persistence)\b/, 5], [/\b(what (is|does|are)|define|definition of|meaning of|explain)\b.*\b(importance( score)?|emerging|declining|established hub|stable|class(es)?|band|confidence|data quality|reconstructed|static only|observed|skyline index|the index|opportunity radar|radar|gravity|link prediction|indicative|rough range|coverage)\b/, 7], [/\bwhat does (emerging|declining|stable|hub|established hub|reconstructed|static only|indicative only|rough range) mean\b/, 8]] },
    { intent: "uncertainty", patterns: [[/\b(how (confident|certain|sure|reliable|trustworthy)|uncertain\w*|bands?|intervals?|range of|margin|error bars?|confidence (level|in|for|of)|reliab\w*|trust (this|the|it)|can i trust)\b/, 7]] },
    { intent: "airport_details", patterns: [[/\b(why|drivers?|reason|because|what('s| is) (driving|behind)|explain|what makes|outlook|prospects?|future of|forecast for|trajectory of|details?|profile|summary|overview of|deep dive|brief me)\b/, 4], [/\b(tell me about|what about|how about|info on|information on|what do you know about)\b/, 4]] },
    { intent: "show_airport", patterns: [[/^(show|find|open|go to|goto|take me to|zoom to|zoom in on|zoom on|fly to|locate|where is|where's|navigate to|jump to|select|pick|look at|center on|focus on|pan to|i want to see|show me|look up|lookup)\b/, 6], [/\b(on (the )?map|show .* on map|map it|plot)\b/, 3]] },
    { intent: "compare", patterns: [[/\b(compare|comparison|versus|vs|side by side|head to head|against|difference between|differ|better than|worse than|or)\b/, 5], [/\b(which is (bigger|better|stronger|more important|larger))\b/, 5]] },
    { intent: "trajectory", patterns: [[/\b(overtake|surpass|catch up|outgrow|outpace|leapfrog|eclipse|pass)\b/, 8], [/\b(will|is .* going to|gonna|likely to|expected to|projected to|forecast to|does .* (decline|grow|fall|rise|improve|shrink|drop|recover))\b/, 4], [/\b(decline|grow|fall|rise|improve|shrink|drop|recover|gain|lose|slip|stagnate|boom)\b/, 2]] },
    { intent: "rank_of", patterns: [[/\b(where does .* (rank|stand|sit|place|fall)|rank of|ranking of|ranked|what rank|how does .* rank|position of|how important is|how big is|how (strong|significant) is|standing of|rank (for|at)|global rank|is .* in the top|place in the)\b/, 8]] },
    { intent: "top_n", patterns: [[/\b(top|best|biggest|largest|leading|fastest|most|highest|lowest|worst|bottom|strongest|weakest|greatest|main|key|major|busiest|list|rank|ranking|rankings|leaderboard|which airports|what airports|which hubs|which cities|which ones)\b/, 4], [/\b(grow the most|grow most|will grow|growing|risers?|fallers?|climbers?|gainers?|losers?|winners?|improved|improving|declin|emerging|rising|falling|booming|hubs?|connected)\b/, 3], [/\b(top|best|biggest|largest|fastest|most|highest)\s+(\d+|five|ten|three|twenty)\b/, 4]] },
    { intent: "count", patterns: [[/\b(how many|number of|count( of)?|total( number)?|how much of|what share|percentage of|percent of|proportion of|what fraction)\b/, 9]] },
    { intent: "country_overview", patterns: [[/\b(tell me about|overview|summary|snapshot|state of|aviation (in|market|sector|industry)|market|economy|outlook for|how is|how's|what('s| is) happening in|brief me on|profile)\b/, 4], [/\b(aviation|air travel|air transport|airline market|airports? (in|of|across))\b/, 3]] },
    { intent: "region_overview", patterns: [[/\b(overview|summary|snapshot|state of|aviation|market|outlook|how is|how's|tell me about|which (countries|regions|markets)|by country|by region|country (ranking|momentum)|strongest (countries|markets)|fastest growing (countries|markets|regions)|momentum)\b/, 4]] },
    { intent: "route_between", patterns: [[/\b(direct (flight|route|connection|service)|nonstop|non-stop|non stop|fly (direct|directly|nonstop)|connect(ed|ion|ing)? (between|from)?|how (do|can|would) (i|you|one) (get|fly|travel|go)|is there a (flight|route|connection|path|way)|path (from|between)|route (from|between)|way to get|how to get|how to fly|hops?|shortest (path|route)|itinerary|travel from|get from|flights? (from|between) .* (to|and)|can i fly|link(ed)? (between|from))\b/, 7], [/\b[a-z]{3,}\s+to\s+[a-z]{3,}\b/, 2]] },
    { intent: "routes_from", patterns: [[/\b(where does .* fly|where can i fly from|destinations? (from|of|served)|routes? (from|out of|served by|of)|serves|served|connections? (from|of|at)|fly (from|out of)|network of|connectivity of|how many (routes|destinations)|what (routes|destinations|cities) does|which (cities|airports|destinations) (does|can)|nonstop (from|destinations))\b/, 7]] },
    { intent: "opportunities", patterns: [[/\b(opportunit\w*|radar|candidates?|unserved|new routes?|route (ideas?|suggestions?|candidates?|opportunit\w*)|airline (opportunit\w*|candidates?|should|could|launch|open|start)|launch(es|ing)? (a )?(new )?(route|service)|invest\w*|touris\w*|destinations? (to watch|for)|where (should|to) (invest|build|expand|launch)|which routes (should|could)|bet on|watchlist|picks?)\b/, 7]] },
    { intent: "resilience", patterns: [[/\b(resilien\w*|closes?|closed|closure|shut(s|down| down)?|goes? (down|offline|dark)|removed?|removal|fails?|failure|outage|disrupt\w*|knock(ed)? out|taken out|single point of failure|critical hubs?|most critical|fragile|vulnerab\w*|articulation|redundan\w*|dependen\w*|choke ?points?|bottlenecks?|what (if|happens) .*(closes?|shut|removed|offline|down|fails))\b/, 8]] },
    { intent: "scenario", patterns: [[/\b(scenarios?|sensitivit\w*|elasticit\w*|what if .*(gdp|economy|tourism|population|growth|traffic|recession|boom)|if .*(gdp|economy|tourism|population|traffic|growth) .*(grows?|rises?|falls?|drops?|faster|slower|increase|decrease|higher|lower)|recession|gdp|per capita|tourism (grows|growth|boom|collapse)|population (growth|grows|boom)|\d+\s?(%|percent|pp|points?) (faster|slower|higher|lower|more|less)|shock|stress test)\b/, 8]] },
    { intent: "network_stats", patterns: [[/\b(network (stats|statistics|size|density|structure|overview|summary|health|metrics)|how many (routes|edges|links|connections|nodes)|average degree|clustering|betweenness|components?|giant component|density|graph|total routes|how big is the network|how connected is the (world|network|graph))\b/, 8]] },
    { intent: "navigate", patterns: [[/\b(open|switch|go to|show|take me to|navigate to|jump to|back to|change to|set|use|toggle|view|activate|enable|display)\b.*\b(radar|opportunity radar|intelligence|intel|scenario|method(ology)?|map view|map tab|the map|compare drawer|comparison|filters?|settings|horizon|\+5|\+10|2030|2035|present|current|baseline|five years|ten years|5 years|10 years)\b/, 7], [/\b(zoom (in|out)|reset( the)? (map|view|filters|everything|all)|reset|clear (the )?(filters|map|selection)|center (the )?map|fit (the )?world|world view)\b/, 7], [/^(radar|intelligence|intel|scenario|methodology|method|map)$/, 8], [/\b(switch|set|change) (to )?(horizon|\+5|\+10|current|present|2030|2035)\b/, 9], [/\b(only|just|filter (to|by)|hide|show only|limit to)\b.*\b(emerging|declining|stable|hubs?|observed|reconstructed|static|high confidence|low confidence)\b/, 7]] },
  ];

  function scoreIntents(norm, ents, ctx) {
    const lower = norm.lower;
    const scores = {};
    INTENT_RULES.forEach((rule) => {
      let s = 0;
      rule.patterns.forEach(([re, w]) => { if (re.test(lower)) s += w; });
      scores[rule.intent] = s;
    });
    const nAirports = ents.airports.length;
    const scoped = ents.countries.length > 0 || ents.regions.length > 0;
    const hasClass = ents.classes.length > 0;

    // Entity-informed boosts
    if (nAirports >= 2) { scores.compare += 4; scores.route_between += (scores.route_between > 0 ? 4 : 1); scores.trajectory += (scores.trajectory > 0 ? 3 : 0); }
    if (nAirports === 1) {
      scores.show_airport += 3; scores.airport_details += 2; scores.routes_from += (scores.routes_from > 0 ? 3 : 0);
      scores.rank_of += (scores.rank_of > 0 ? 3 : 0); scores.resilience += (scores.resilience > 0 ? 3 : 0);
      if (ents.horizon && scores.show_airport > 0) scores.airport_details += 1;
    }
    if (nAirports === 0 && ents.refersToSelected && ctx.selectedAirport) { scores.airport_details += 2; scores.show_airport += 1; }
    if (scoped) {
      scores.top_n += 3; scores.country_overview += ents.countries.length ? 3 : 0; scores.region_overview += ents.regions.length ? 3 : 0;
      scores.count += scores.count > 0 ? 2 : 0;
      scores.show_airport -= 2; scores.airport_details -= 2; scores.compare -= nAirports >= 2 ? 0 : 3;
      if (ents.countries.length >= 2 && scores.compare > 0) scores.compare += 4;
    }
    if (hasClass) { scores.top_n += 3; scores.count += scores.count > 0 ? 2 : 0; if (scoped && scores.top_n > 0) scores.country_overview -= 2; }
    if (ents.n != null) { scores.top_n += 4; scores.navigate -= 2; }
    if (ents.horizon && nAirports === 0 && !scoped && !hasClass && /^(switch|set|change|use|go)\b|\b(horizon)\b/.test(lower)) scores.navigate += 4;
    if (ents.horizon && nAirports === 0 && !scoped && !hasClass && scores.navigate === 0 && scores.top_n === 0 && /^(and |what about |how about )?(in |at |for |by )?(2030|2035|\+?5|\+?10|ten years|five years|today|now)( years)?$/.test(lower)) scores.followup_horizon = 20;
    // "which airports in india will grow the most by 2035" -> top_n (grow the most + scope)
    if (/\b(grow|rise|improve|gain)\w*\s+(the\s+)?most\b|\bmost\s+(growth|improved|improving)\b|\bfastest\b/.test(lower)) scores.top_n += 5;
    // explicit question words about "why" favour details
    if (/^why\b/.test(lower)) { scores.airport_details += 6; scores.top_n -= 3; }
    // route specific: "X to Y" with 2 airports
    if (nAirports >= 2 && /\b(to|from|between)\b/.test(lower) && /\b(flight|fly|route|direct|get|connect|path|hops?|travel|go)\b/.test(lower)) scores.route_between += 6;
    if (nAirports >= 2 && /\bcompare|vs|versus|better|bigger|stronger|difference\b/.test(lower)) scores.compare += 4;
    // single airport + "closes" -> resilience
    if (nAirports >= 1 && /\b(close|closes|closed|shut|offline|removed|fails|down)\b/.test(lower)) scores.resilience += 4;
    // Country + aviation/overview wording vs top list
    if (scoped && !hasClass && ents.n == null && !/\b(top|best|biggest|largest|most|which|fastest|list|rank|airports)\b/.test(lower)) { scores.country_overview += 3; scores.region_overview += 3; }
    if (ents.countries.length && ents.regions.length === 0) scores.region_overview -= 4;
    if (ents.regions.length && ents.countries.length === 0) scores.country_overview -= 4;
    if (!scoped) { scores.country_overview -= 5; scores.region_overview -= 3; }
    // navigation guard: if an airport is named, "open X" should show the airport, not a tab
    if (nAirports >= 1 && scores.navigate > 0 && !/\b(radar|intel|scenario|method|horizon|filter|reset|zoom (in|out))\b/.test(lower)) scores.navigate -= 6;
    if (nAirports === 0 && scores.show_airport > 0 && !ents.refersToSelected && scores.navigate === 0 && !scoped) scores.show_airport -= 3;
    if (/\b(countr(y|ies)|nations?|markets?|economies)\b/.test(lower) && !ents.countries.length) { scores.region_overview += 16; scores.top_n -= 6; }
    if (scores.navigate > 0 && nAirports === 0 && !scoped && /^(open|show|go to|switch to|take me to|back to|view)\b.*\b(radar|intel|intelligence|scenario|method|methodology|map)\b/.test(lower)) { scores.navigate += 10; scores.opportunities -= 4; }
    if (scores.resilience > 0 && /\b(critical|fragile|vulnerab|closes?|closed|closure|shut|removed|offline|articulation|redundan|single point)/.test(lower)) { scores.resilience += 8; scores.top_n -= 4; }
    if (scores.opportunities > 0) { scores.show_airport -= 4; scores.top_n -= 2; scores.routes_from -= 2; }
    if (scores.network_stats > 0) { scores.show_airport -= 3; scores.compare -= 4; }
    if (scores.scenario > 0 && /\b(gdp|tourism|population|traffic|economy|recession)\b/.test(lower)) { scores.scenario += 6; scores.top_n -= 3; scores.country_overview -= 3; }
    if (scores.methodology > 0 && nAirports === 0 && !scoped) { scores.show_airport -= 3; scores.airport_details -= 3; }

    const ranked = Object.keys(scores).map((k) => ({ intent: k, score: scores[k] })).sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const second = ranked[1] || { score: 0 };
    let confidence = top.score <= 0 ? 0.15 : Math.min(0.97, 0.45 + 0.05 * top.score + 0.04 * Math.max(0, top.score - second.score));
    return { intent: top.score > 0 ? top.intent : "fallback", confidence, ranked };
  }

  // ---------------------------------------------------------------------------
  // 6. HTML builders
  // ---------------------------------------------------------------------------
  function actionAttr(a) { return `data-copilot-action='${esc(JSON.stringify(a)).replace(/'/g, "&#39;")}'`; }
  function chip(labelText, action, cls) { return `<button type="button" class="cp-chip ${cls || ""}" ${actionAttr(action)}>${esc(labelText)}</button>`; }
  function apChip(ap) { return chip(`${ap.iata} ${cityOf(ap)}`, { type: "select_airport", iata: ap.iata }, "cp-chip-airport"); }
  function badge(cls) { return `<span class="cp-badge cp-badge-${esc(cls)}">${esc(CLASS_LABELS[cls] || cls)}</span>`; }
  function arrow(delta) { const d = Number(delta) || 0; const cls = d > 0.05 ? "up" : d < -0.05 ? "down" : "flat"; const sym = cls === "up" ? "▲" : cls === "down" ? "▼" : "▶"; return `<span class="cp-delta cp-delta-${cls}">${sym} ${signed(d)}</span>`; }
  function barlet(v, max, cls) { const pct = Math.max(2, Math.min(100, (100 * (Number(v) || 0)) / (max || 100))); return `<span class="cp-bar ${cls || ""}"><i style="width:${pct.toFixed(0)}%"></i></span>`; }
  function card(title, body, foot) { return `<div class="cp-card"><div class="cp-card-title">${title}</div>${body}${foot ? `<div class="cp-card-foot">${foot}</div>` : ""}</div>`; }
  function note(text) { return `<div class="cp-note">${text}</div>`; }
  function kpis(items) { return `<div class="cp-kpis">${items.map((k) => `<div class="cp-kpi"><div class="cp-kpi-v ${k.cls || ""}">${k.v}</div><div class="cp-kpi-l">${esc(k.l)}</div></div>`).join("")}</div>`; }

  function airportTable(idx, rows, opts) {
    opts = opts || {};
    const h = opts.horizon || "h10";
    const showRank = opts.rank !== false;
    const head = `<tr>${showRank ? "<th>#</th>" : ""}<th>Airport</th><th>Country</th><th class="num">Now</th><th class="num">2030</th><th class="num">2035</th><th>${esc(opts.deltaLabel || "Δ " + horizonYear(h))}</th><th>Class</th></tr>`;
    const body = rows.map((ap, i) => {
      const d = changeAt(ap, h);
      return `<tr ${actionAttr({ type: "select_airport", iata: ap.iata })} class="cp-row" tabindex="0" role="button">${showRank ? `<td class="num muted">${i + 1}</td>` : ""}<td><b>${esc(ap.iata)}</b> <span class="muted">${esc(cityOf(ap))}</span></td><td class="muted">${esc(idx.countryName[ap.country] || ap.country)}</td><td class="num">${f1(ap.importance_present)}</td><td class="num">${f1(levelAt(ap, "h5"))}</td><td class="num">${f1(levelAt(ap, "h10"))}</td><td>${arrow(d)}</td><td>${badge(classAt(ap, h))}</td></tr>`;
    }).join("");
    return `<div class="cp-table-wrap"><table class="cp-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function routeChips(idx, path) {
    return `<div class="cp-path">${path.map((code, i) => { const ap = idx.lookup[code]; return `${i ? '<span class="cp-path-arrow">→</span>' : ""}${chip(ap ? `${code} ${cityOf(ap)}` : code, { type: "select_airport", iata: code }, "cp-chip-airport")}`; }).join("")}</div>`;
  }

  function followChips(followups) { return `<div class="cp-followups">${followups.map((q) => `<button type="button" class="cp-followup" data-copilot-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>`; }

  // Aggregates for a set of airports (client-side country/region KPIs)
  function aggregate(list) {
    const n = list.length;
    if (!n) return null;
    const sum = (f) => list.reduce((s, a) => s + (Number(f(a)) || 0), 0);
    const wsum = sum((a) => a.importance_present || 0) || 1;
    const agg = {
      n,
      meanNow: sum((a) => a.importance_present) / n,
      meanH5: sum((a) => levelAt(a, "h5")) / n,
      meanH10: sum((a) => levelAt(a, "h10")) / n,
      wChangeH5: sum((a) => changeAt(a, "h5") * (a.importance_present || 0)) / wsum,
      wChangeH10: sum((a) => changeAt(a, "h10") * (a.importance_present || 0)) / wsum,
      nEmergingH5: list.filter((a) => classAt(a, "h5") === "emerging").length,
      nEmergingH10: list.filter((a) => classAt(a, "h10") === "emerging").length,
      nDecliningH5: list.filter((a) => classAt(a, "h5") === "declining").length,
      nDecliningH10: list.filter((a) => classAt(a, "h10") === "declining").length,
      nHub: list.filter((a) => classAt(a, "h5") === "established_hub").length,
      nStable: list.filter((a) => classAt(a, "h5") === "stable").length,
      routes: sum((a) => (a.routes ? a.routes.length : 0)),
    };
    const byNow = list.slice().sort((a, b) => (b.importance_present || 0) - (a.importance_present || 0));
    agg.top = byNow.slice(0, 5);
    const byRise = list.slice().sort((a, b) => changeAt(b, "h10") - changeAt(a, "h10"));
    agg.topRiser = byRise[0]; agg.topFaller = byRise[byRise.length - 1];
    return agg;
  }

  function scopeAirports(idx, ents) {
    // Returns {list, label, kind} for the country/region scope found in entities (or all)
    if (ents.countries.length) {
      const isos = ents.countries.map((c) => c.iso);
      const list = idx.airports.filter((a) => isos.includes(a.country));
      return { list, label: ents.countries.map((c) => c.name).join(" & "), kind: "country", isos };
    }
    if (ents.regions.length) {
      const set = new Set();
      ents.regions.forEach((r) => regionCountrySet(idx, r.key).forEach((c) => set.add(c)));
      const list = idx.airports.filter((a) => set.has(a.country));
      return { list, label: ents.regions.map((r) => r.name).join(" & "), kind: "region", isos: Array.from(set) };
    }
    return { list: idx.airports, label: "the world", kind: "world", isos: null };
  }

  function fitAction(list) {
    const pts = list.filter((a) => a.latitude != null && a.longitude != null);
    if (!pts.length) return null;
    return { type: "fit_bounds", iatas: pts.map((a) => a.iata) };
  }

  function resolveHorizon(ents, ctx, fallback) {
    return ents.horizon || fallback || (ctx.horizon && ctx.horizon !== "present" ? ctx.horizon : null) || "h10";
  }

  function driversText(ap, h) {
    const f = fcAt(ap, h) || ap.forecast_h5 || {};
    const pos = (f.positive_drivers || []).map((d) => DRIVER_HUMAN[d] || d);
    const neg = (f.negative_drivers || []).map((d) => DRIVER_HUMAN[d] || d);
    return { pos, neg };
  }

  // ---------------------------------------------------------------------------
  // 7. Handlers
  // ---------------------------------------------------------------------------
  const H = {};

  H.greeting = (q) => {
    const name = q.ctx.selectedAirport ? ` You're looking at ${label(q.ctx.selectedAirport)}.` : "";
    const reply = /^(thanks|thank you|thx|cheers|great|awesome|cool|nice)/.test(q.norm.lower) ? "You're welcome. Ask me anything about airports, routes, countries or forecasts." : `Hello, I'm Skyline Copilot, your travel operating system over ${q.idx.airports.length.toLocaleString()} airports.${name}`;
    return { reply, html: card("Skyline Copilot", `<p>${esc(reply)}</p>${note("Try a country, a route, a comparison or a what-if scenario.")}`), actions: [], followups: ["Which Indian airports grow most by 2035?", "Is there a direct route DEL to SFO?", "What happens if DXB closes?"], confidence: 0.9 };
  };

  H.help = (q) => {
    const groups = [
      ["Airports", ["show Hyderabad", "why is BLR emerging?", "where does DOH fly?", "where does Chennai rank?"]],
      ["Rankings", ["top 10 risers in Africa by 2035", "biggest hubs in Europe", "how many emerging airports in Asia?"]],
      ["Countries", ["tell me about India's aviation", "Vietnam 2035", "fastest growing countries"]],
      ["Routes", ["is there a direct flight DEL to SFO?", "how do I get from Nairobi to Lima?"]],
      ["Analysis", ["compare SIN and DXB", "will BLR overtake MAA?", "what happens if DXB closes?", "if India's GDP grows 2% faster"]],
      ["Navigation", ["switch to 2030", "open radar", "reset map"]],
    ];
    const html = card("What you can ask", groups.map(([g, ex]) => `<div class="cp-help-group"><div class="cp-help-label">${esc(g)}</div>${ex.map((e) => `<button type="button" class="cp-followup" data-copilot-ask="${esc(e)}">${esc(e)}</button>`).join("")}</div>`).join(""));
    return { reply: "I can answer questions about any airport, country, region, route, ranking, forecast or scenario, and I can drive the map for you. Tap an example to try it.", html, actions: [], followups: ["top 10 risers in Africa by 2035", "compare SIN and DXB", "what is the importance score?"], confidence: 0.95 };
  };

  function airportCardHtml(q, ap, h) {
    const idx = q.idx;
    const f5 = ap.forecast_h5 || {}, f10 = ap.forecast_h10 || {};
    const rank = ap.rank_present || (idx.intel && idx.intel.ranks && idx.intel.ranks[ap.iata] && idx.intel.ranks[ap.iata].present);
    const rankH10 = ap.rank_h10 || (idx.intel && idx.intel.ranks && idx.intel.ranks[ap.iata] && idx.intel.ranks[ap.iata].h10);
    const { pos, neg } = driversText(ap, h);
    const dq = ap.data_quality || "observed";
    const body = `
      <div class="cp-ap-head"><div><div class="cp-ap-name">${esc(ap.name)}</div><div class="muted">${esc(cityOf(ap))}, ${esc(idx.countryName[ap.country] || ap.country)}${rank ? ` · global rank #${rank}` : ""}</div></div>${badge(classAt(ap, h))}</div>
      ${kpis([
        { v: f1(ap.importance_present), l: "Importance now" },
        { v: `${f1(levelAt(ap, "h5"))} ${arrow(changeAt(ap, "h5"))}`, l: "2030" },
        { v: `${f1(levelAt(ap, "h10"))} ${arrow(changeAt(ap, "h10"))}`, l: `2035 (${f10.level_damped != null ? h10ModeLabel() : "raw ensemble"})` },
        { v: String(ap.routes ? ap.routes.length : 0), l: "Routes" },
      ])}
      <div class="cp-bars">${barlet(ap.importance_present, 100, "now")}${barlet(levelAt(ap, "h5"), 100, "h5")}${barlet(levelAt(ap, "h10"), 100, "h10")}</div>
      <div class="cp-drivers"><div><span class="cp-pos">Tailwinds</span> ${esc(pos.join(" · ") || "n/a")}</div><div><span class="cp-neg">Headwinds</span> ${esc(neg.join(" · ") || "n/a")}</div></div>
      ${note(`Band 2030: ${f1(f5.band_low)}-${f1(f5.band_high)} (${esc(f5.band_label || "")}) · 2035: ${f1(f10.band_low)}-${f1(f10.band_high)} (${esc(f10.band_label || "")}) · data ${esc(dq)}, ${esc(ap.importance_confidence || "medium")} confidence${rankH10 ? ` · rank ${rank || "?"} → #${rankH10} by 2035` : ""}`)}
      <div class="cp-chiprow">${chip("Routes", { type: "ask", q: `where does ${ap.iata} fly` })}${chip("Why?", { type: "ask", q: `why is ${ap.iata} ${CLASS_LABELS[classAt(ap, h)].toLowerCase()}` })}${chip("Compare", { type: "ask", q: `compare ${ap.iata} with ${ap.iata === "DXB" ? "SIN" : "DXB"}` })}${chip("If it closes", { type: "ask", q: `what happens if ${ap.iata} closes` })}</div>`;
    return card(`${esc(ap.iata)} · ${esc(cityOf(ap))}`, body);
  }

  function pickAirport(q) {
    if (q.ents.airports.length) return q.ents.airports[0].ap;
    if (q.ctx.selectedAirport && (q.ents.refersToSelected || q.ents.airports.length === 0)) return q.ctx.selectedAirport;
    return null;
  }

  H.show_airport = (q) => {
    const e = q.ents.airports[0];
    const ap = pickAirport(q);
    if (!ap) return H.fallback(q);
    const h = resolveHorizon(q.ents, q.ctx, "h5");
    const cls = CLASS_LABELS[classAt(ap, h)].toLowerCase();
    const reply = `${cityOf(ap)}, ${ap.iata}: importance ${f1(ap.importance_present)} today, ${f1(levelAt(ap, "h5"))} by 2030 and ${f1(levelAt(ap, "h10"))} by 2035, classed ${cls}. Data is ${ap.data_quality || "observed"} with ${ap.importance_confidence || "medium"} confidence.`;
    let html = airportCardHtml(q, ap, h);
    if (e && e.alternatives && e.alternatives.length > 1) {
      html += card("Other matches", `<div class="cp-chiprow">${e.alternatives.filter((c) => c !== ap.iata).map((c) => q.idx.lookup[c]).filter(Boolean).map(apChip).join("")}</div>`);
    }
    const actions = [{ type: "select_airport", iata: ap.iata }, { type: "fly_to", lat: ap.latitude, lon: ap.longitude, zoom: 6 }];
    return { reply, html, actions, followups: [`Why is ${ap.iata} ${cls}?`, `Where does ${ap.iata} fly?`, `Where does ${cityOf(ap)} rank?`], confidence: 0.9, alternatives: e && e.alternatives };
  };

  H.airport_details = (q) => {
    const ap = pickAirport(q);
    if (!ap) {
      if (q.ents.countries.length || q.ents.regions.length) return q.ents.countries.length ? H.country_overview(q) : H.region_overview(q);
      return H.fallback(q);
    }
    const lower = q.norm.lower;
    const isAskingDeclining = /\bwhy\s+(is|does)\s+.*(declin|fall|drop|shrink|los)\w*/i.test(lower);
    if (isAskingDeclining) {
      const cls10 = classAt(ap, "h10");
      const d10 = changeAt(ap, "h10");
      const isDeclining = cls10 === "declining" || d10 < 0;
      let reply;
      if (!isDeclining) {
        reply = `${cityOf(ap)} (${ap.iata}) is not declining. It is classified as ${CLASS_LABELS[cls10].toLowerCase()} with a 10-year change of ${signed(d10)} points (${f1(ap.importance_present)} today to ${f1(levelAt(ap, "h10"))} by 2035).`;
      } else {
        const { neg } = driversText(ap, "h10");
        reply = `${cityOf(ap)} (${ap.iata}) is declining with a 10-year change of ${signed(d10)} points (${f1(ap.importance_present)} today to ${f1(levelAt(ap, "h10"))} by 2035), driven down by ${neg[0] || "downward momentum"}.`;
      }
      const html = airportCardHtml(q, ap, "h10");
      return { reply, html, actions: [{ type: "select_airport", iata: ap.iata }], followups: [`How confident is the ${ap.iata} forecast?`, `Where does ${ap.iata} fly?`, `Compare ${ap.iata} with ${ap.iata === "SIN" ? "DXB" : "SIN"}`], confidence: 0.9 };
    }
    const h = resolveHorizon(q.ents, q.ctx, "h5");
    const { pos, neg } = driversText(ap, h);
    const cls = CLASS_LABELS[classAt(ap, h)].toLowerCase();
    const d = changeAt(ap, h);
    const reply = `${cityOf(ap)} (${ap.iata}) is ${cls} with a ${signed(d)} point move by ${horizonYear(h)}, driven by ${pos.slice(0, 2).join(" and ") || "its baseline"}. The main headwind is ${neg[0] || "limited data"}.`;
    const html = airportCardHtml(q, ap, h);
    return { reply, html, actions: [{ type: "select_airport", iata: ap.iata }], followups: [`How confident is the ${ap.iata} forecast?`, `Where does ${ap.iata} fly?`, `Compare ${ap.iata} with ${ap.iata === "SIN" ? "DXB" : "SIN"}`], confidence: 0.85 };
  };

  H.compare = (q) => {
    const idx = q.idx;
    let aps = q.ents.airports.map((e) => e.ap);
    if (aps.length === 1 && q.ctx.selectedAirport && q.ctx.selectedAirport.iata !== aps[0].iata) aps = [q.ctx.selectedAirport, aps[0]];
    if (aps.length < 2 && q.ents.countries.length >= 2) return H.region_overview(q);
    if (aps.length < 2) {
      const prev = (q.ctx.history || []).slice().reverse().find((hh) => hh.entities && hh.entities.airports && hh.entities.airports.length);
      if (prev && aps.length === 1) aps = [idx.lookup[prev.entities.airports[0]] || aps[0], aps[0]].filter(Boolean);
    }
    if (aps.length < 2) return { reply: "Tell me two airports to compare, for example compare SIN and DXB.", html: card("Compare", `<p>Which two airports?</p><div class="cp-chiprow">${chip("SIN vs DXB", { type: "ask", q: "compare SIN and DXB" })}${chip("LHR vs CDG", { type: "ask", q: "compare LHR and CDG" })}${chip("DEL vs BOM", { type: "ask", q: "compare DEL and BOM" })}</div>`), actions: [], followups: ["compare SIN and DXB", "compare LHR and CDG", "compare DEL and BOM"], confidence: 0.5 };
    const [a, b] = aps;
    const h = resolveHorizon(q.ents, q.ctx, "h10");
    const la = levelAt(a, h), lb = levelAt(b, h);
    const leader = la >= lb ? a : b, other = la >= lb ? b : a;
    const reply = `${label(leader)} leads ${label(other)} by ${f1(Math.abs(la - lb))} points by ${horizonYear(h)} (${f1(la >= lb ? la : lb)} vs ${f1(la >= lb ? lb : la)}). Trajectories: ${a.iata} ${signed(changeAt(a, h))}, ${b.iata} ${signed(changeAt(b, h))}.`;
    const rows = [a, b].map((ap) => `<tr><td><b>${esc(ap.iata)}</b> <span class="muted">${esc(cityOf(ap))}</span></td><td class="num">${f1(ap.importance_present)}</td><td class="num">${f1(levelAt(ap, "h5"))}</td><td class="num">${f1(levelAt(ap, "h10"))}</td><td>${arrow(changeAt(ap, h))}</td><td class="num">${ap.routes ? ap.routes.length : 0}</td><td>${badge(classAt(ap, h))}</td></tr>`).join("");
    const html = card(`${esc(a.iata)} vs ${esc(b.iata)}`, `<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Airport</th><th class="num">Now</th><th class="num">2030</th><th class="num">2035</th><th>Δ ${horizonYear(h)}</th><th class="num">Routes</th><th>Class</th></tr></thead><tbody>${rows}</tbody></table></div><div class="cp-bars"><div class="cp-bar-row"><span>${esc(a.iata)}</span>${barlet(la, 100, "h10")}<b>${f1(la)}</b></div><div class="cp-bar-row"><span>${esc(b.iata)}</span>${barlet(lb, 100, "h10")}<b>${f1(lb)}</b></div></div>${note(`Shared destinations: ${(a.routes || []).filter((r) => (b.routes || []).includes(r)).length}. Opened the comparison drawer.`)}`);
    const actions = [{ type: "compare", a: a.iata, b: b.iata }];
    if (/\b(map|show|draw|route)\b/.test(q.norm.lower)) actions.push({ type: "draw_route", a: a.iata, b: b.iata }, { type: "highlight", iatas: [a.iata, b.iata] });
    return { reply, html, actions, followups: [`Will ${other.iata} overtake ${leader.iata}?`, `Is there a direct route ${a.iata} to ${b.iata}?`, `Why is ${leader.iata} ${CLASS_LABELS[classAt(leader, h)].toLowerCase()}?`], confidence: 0.9 };
  };

  function sortForClass(list, cls, h) {
    const l = list.slice();
    if (cls === "emerging") l.sort((a, b) => changeAt(b, h) - changeAt(a, h));
    else if (cls === "declining") l.sort((a, b) => changeAt(a, h) - changeAt(b, h));
    else l.sort((a, b) => levelAt(b, h) - levelAt(a, h));
    return l;
  }

  H.top_n = (q) => {
    const idx = q.idx, lower = q.norm.lower;
    const scope = scopeAirports(idx, q.ents);
    const h = resolveHorizon(q.ents, q.ctx, "h10");
    const n = q.ents.n || 10;
    const cls = q.ents.classes.length ? q.ents.classes[0].cls : null;
    let mode, list, title, sortedAll;
    const wantsFaller = cls === "declining" || /\b(fall|decline|drop|lose|loser|worst|weakest|shrink|bottom|lowest)\w*/.test(lower);
    const wantsRiser = cls === "emerging" || /\b(grow|rise|riser|gain|improv|fastest|boom|climb|momentum|winner|most improved)\w*/.test(lower);
    const wantsHub = cls === "established_hub" || /\b(hub|biggest|largest|most connected|best connected|busiest|most important|major|leading|highest)\b/.test(lower);
    const wantsConnected = /\b(most connected|best connected|most routes|busiest|most destinations)\b/.test(lower);
    const wantsClimbers = /\b(rank climb|climbers?|rank (gain|jump|drop|fall)|biggest (jump|drop) in rank)\b/.test(lower);
    const deg = (a) => (idx.adj[a.iata] ? idx.adj[a.iata].size : 0);
    if (wantsConnected) { mode = "connected"; sortedAll = scope.list.slice().sort((a, b) => deg(b) - deg(a)); title = `Most connected airports in ${scope.label}`; }
    else if (wantsClimbers && idx.intel && idx.intel.rankings) {
      const key = wantsFaller ? "biggest_rank_drops_h10" : "biggest_rank_climbers_h10";
      const rows = (idx.intel.rankings[key] || []).map((r) => idx.lookup[r.iata]).filter(Boolean).filter((a) => !scope.isos || scope.isos.includes(a.country));
      mode = "climbers"; sortedAll = rows; title = `${wantsFaller ? "Biggest rank drops" : "Biggest rank climbers"} by 2035 in ${scope.label}`;
    }
    else if (wantsFaller && !wantsRiser) { mode = "fallers"; sortedAll = scope.list.slice().sort((a, b) => changeAt(a, h) - changeAt(b, h)); title = `Biggest fallers in ${scope.label} by ${horizonYear(h)}`; }
    else if (wantsRiser) { mode = "risers"; sortedAll = scope.list.slice().sort((a, b) => changeAt(b, h) - changeAt(a, h)); title = `Fastest risers in ${scope.label} by ${horizonYear(h)}`; }
    else if (cls === "stable") { mode = "stable"; sortedAll = scope.list.filter((a) => classAt(a, h) === "stable").sort((a, b) => levelAt(b, h) - levelAt(a, h)); title = `Largest stable airports in ${scope.label}`; }
    else { mode = "hubs"; sortedAll = scope.list.slice().sort((a, b) => levelAt(b, h) - levelAt(a, h)); title = `${wantsHub ? "Biggest hubs" : "Top airports"} in ${scope.label} at ${horizonLabel(h)}`; }
    if (cls && (mode === "risers" || mode === "fallers" || mode === "hubs")) {
      const filtered = sortedAll.filter((a) => classAt(a, h) === cls);
      if (filtered.length >= Math.min(n, 3)) sortedAll = filtered;
    }
    list = sortedAll.slice(0, n);
    if (!list.length) return { reply: `I have no airports matching that in ${scope.label}. Try a broader region or a different class.`, html: card(title, note("No matches.")), actions: [], followups: ["top 10 risers worldwide by 2035", "biggest hubs in Asia", "how many airports in Africa?"], confidence: 0.5 };
    const first = list[0];
    const spoken = mode === "connected" ? `${label(first)} is the most connected in ${scope.label} with ${deg(first)} network links.` : mode === "fallers" ? `${label(first)} falls the most in ${scope.label}, ${signed(changeAt(first, h))} points by ${horizonYear(h)}.` : mode === "risers" ? `${label(first)} grows the most in ${scope.label}, ${signed(changeAt(first, h))} points to ${f1(levelAt(first, h))} by ${horizonYear(h)}.` : `${label(first)} leads ${scope.label} with importance ${f1(levelAt(first, h))} at ${horizonLabel(h)}.`;
    const others = list.slice(1, 4).map((a) => a.iata).join(", ");
    const reply = `${spoken}${others ? ` Next: ${others}.` : ""}`;
    const html = card(`${esc(title)} · top ${list.length}`, airportTable(idx, list, { horizon: h, deltaLabel: mode === "connected" ? "Δ 2035" : undefined }), `${scope.list.length} airports in scope · ${h === "h10" ? h10Footnote() : "scores 0-100"}`);
    const actions = [{ type: "highlight", iatas: list.map((a) => a.iata) }];
    const fit = fitAction(list); if (fit) actions.push(fit);
    if (q.ents.horizon) actions.push({ type: "set_horizon", horizon: q.ents.horizon });
    const fu = [mode === "risers" ? `Biggest fallers in ${scope.label} by ${horizonYear(h)}` : `Fastest risers in ${scope.label} by 2035`, `How many emerging airports in ${scope.label}?`, `Why is ${first.iata} ${CLASS_LABELS[classAt(first, h)].toLowerCase()}?`];
    return { reply, html, actions, followups: fu, confidence: 0.88, rows: list.map((a) => a.iata) };
  };

  H.count = (q) => {
    const idx = q.idx;
    const scope = scopeAirports(idx, q.ents);
    const h = resolveHorizon(q.ents, q.ctx, "h5");
    const cls = q.ents.classes.length ? q.ents.classes[0].cls : null;
    const lower = q.norm.lower;
    if (/\b(routes|connections|links|edges|destinations)\b/.test(lower) && q.ents.airports.length) return H.routes_from(q);
    if (/\b(routes|connections|links|edges)\b/.test(lower) && !cls) return H.network_stats(q);
    const matched = cls ? scope.list.filter((a) => classAt(a, h) === cls) : scope.list;
    const agg = aggregate(scope.list);
    const pct = scope.list.length ? (100 * matched.length) / scope.list.length : 0;
    const what = cls ? `${CLASS_LABELS[cls].toLowerCase()} airports` : "airports";
    const reply = cls ? `${matched.length} of ${scope.list.length} airports in ${scope.label} are ${CLASS_LABELS[cls].toLowerCase()} at ${horizonLabel(h)}, that is ${f1(pct)} percent.` : `${scope.list.length} airports tracked in ${scope.label}: ${agg.nHub} hubs, ${agg.nEmergingH5} emerging, ${agg.nStable} stable and ${agg.nDecliningH5} declining.`;
    const html = card(`${esc(titleCase(what))} in ${esc(scope.label)}`, kpis([
      { v: String(matched.length), l: titleCase(what) }, { v: `${f1(pct)}%`, l: "Share of scope" }, { v: String(scope.list.length), l: "Airports in scope" }, { v: String(agg.nEmergingH10), l: "Emerging by 2035" },
    ]) + (cls && matched.length ? airportTable(idx, sortForClass(matched, cls, h).slice(0, 8), { horizon: h }) : `<div class="cp-classbar">${["established_hub", "emerging", "stable", "declining"].map((c) => { const k = scope.list.filter((a) => classAt(a, h) === c).length; return `<span class="cp-classbar-seg cp-seg-${c}" style="flex:${k || 0.01}" title="${CLASS_LABELS[c]}: ${k}"></span>`; }).join("")}</div><div class="cp-legend">${["established_hub", "emerging", "stable", "declining"].map((c) => `${badge(c)} ${scope.list.filter((a) => classAt(a, h) === c).length}`).join(" ")}</div>`));
    const actions = [];
    if (scope.isos) { const fit = fitAction(matched.length ? matched : scope.list); if (fit) actions.push(fit); actions.push({ type: "highlight", iatas: (matched.length ? matched : scope.list).slice(0, 200).map((a) => a.iata) }); }
    if (cls) actions.push({ type: "filter", classes: [cls] });
    return { reply, html, actions, followups: [`Top 10 ${cls ? CLASS_LABELS[cls].toLowerCase() : "risers"} in ${scope.label}`, `Tell me about ${scope.label} aviation`, `Biggest hubs in ${scope.label}`], confidence: 0.9, count: matched.length };
  };

  function countryIntel(idx, iso) {
    return idx.intel && idx.intel.countries ? idx.intel.countries.find((c) => c.iso2 === iso) : null;
  }

  H.country_overview = (q) => {
    const idx = q.idx;
    if (!q.ents.countries.length) return q.ents.regions.length ? H.region_overview(q) : H.fallback(q);
    const c = q.ents.countries[0];
    const list = idx.byCountry[c.iso] || [];
    if (!list.length) return { reply: `I don't track any airports in ${c.name}.`, html: card(c.name, note("No airports in the index for this country.")), actions: [], followups: ["fastest growing countries", "top 10 hubs in Asia", "how many airports in Africa?"], confidence: 0.6 };
    const h = resolveHorizon(q.ents, q.ctx, "h10");
    const agg = aggregate(list);
    const ci = countryIntel(idx, c.iso);
    const wChange = ci ? (h === "h5" ? ci.traffic_weighted_change_h5 : ci.traffic_weighted_change_h10) : (h === "h5" ? agg.wChangeH5 : agg.wChangeH10);
    const riser = agg.topRiser, faller = agg.topFaller;
    const rankTxt = ci && ci.momentum_rank_h10 ? ` It ranks #${ci.momentum_rank_h10} worldwide for momentum.` : "";
    const reply = `${c.name} has ${list.length} tracked airports with traffic-weighted importance moving ${signed(wChange)} points by ${horizonYear(h)}; ${agg.nEmergingH10} are emerging and ${agg.nDecliningH10} declining.${rankTxt} The strongest riser is ${label(riser)} at ${signed(changeAt(riser, h))}.`;
    const macro = ci && ci.macro ? ci.macro : null;
    const macroHtml = macro ? note(`Macro: GDP growth ${macro.gdp_growth_pct != null ? f1(macro.gdp_growth_pct) + "%" : "n/a"} · GDP/capita ${macro.gdp_per_capita_usd != null ? "$" + Math.round(macro.gdp_per_capita_usd).toLocaleString() : "n/a"} · population ${macro.population != null ? (macro.population / 1e6).toFixed(1) + "M" : "n/a"} · tourism arrivals ${macro.tourism_arrivals != null ? (macro.tourism_arrivals / 1e6).toFixed(1) + "M" : "n/a"}`) : "";
    const html = card(`${esc(c.name)} · aviation outlook ${horizonYear(h)}`, kpis([
      { v: String(list.length), l: "Airports" }, { v: f1(ci ? ci.mean_importance_present : agg.meanNow), l: "Mean importance" }, { v: arrow(wChange), l: `Weighted Δ ${horizonYear(h)}` }, { v: `${agg.nEmergingH10} / ${agg.nDecliningH10}`, l: "Emerging / declining 2035" },
    ]) + `<div class="cp-subtitle">Top airports</div>` + airportTable(idx, agg.top, { horizon: h }) + `<div class="cp-chiprow"><span class="muted">Top riser</span> ${apChip(riser)} ${arrow(changeAt(riser, h))} <span class="muted">${changeAt(faller, h) < 0 ? "Top faller" : "Smallest gain"}</span> ${apChip(faller)} ${arrow(changeAt(faller, h))}</div>` + macroHtml);
    const actions = [{ type: "highlight", iatas: list.map((a) => a.iata) }];
    const fit = fitAction(list); if (fit) actions.push(fit);
    return { reply, html, actions, followups: [`Top 10 risers in ${c.name} by 2035`, `How many emerging airports in ${c.name}?`, `Biggest hubs in ${c.name}`], confidence: 0.88 };
  };

  H.region_overview = (q) => {
    const idx = q.idx;
    const h = resolveHorizon(q.ents, q.ctx, "h10");
    const lower = q.norm.lower;
    // Country ranking mode (which countries grow fastest ...), possibly inside a region
    const wantsCountries = /\b(countr|nation|market)/.test(lower) || (!q.ents.regions.length && !q.ents.countries.length) || q.ents.countries.length >= 2;
    const scope = scopeAirports(idx, q.ents);
    if (wantsCountries || q.ents.countries.length >= 2) {
      const isos = q.ents.countries.length >= 2 ? q.ents.countries.map((c) => c.iso) : uniq(scope.list.map((a) => a.country));
      const wantsFall = /\b(fall|declin|worst|weakest|shrink|lowest|slowest)\w*/.test(lower);
      const wantsBig = /\b(biggest|largest|most important|strongest|top|leading|highest)\b/.test(lower) && !/\b(grow|momentum|fastest|rising)\b/.test(lower);
      const rows = isos.map((iso) => { const l = idx.byCountry[iso] || []; const ci = countryIntel(idx, iso); const agg = aggregate(l); if (!agg) return null; return { iso, name: idx.countryName[iso] || iso, n: l.length, mean: ci ? ci.mean_importance_present : agg.meanNow, w5: ci ? ci.traffic_weighted_change_h5 : agg.wChangeH5, w10: ci ? ci.traffic_weighted_change_h10 : agg.wChangeH10, em: agg.nEmergingH10, de: agg.nDecliningH10, top: agg.top[0] }; }).filter(Boolean).filter((r) => q.ents.countries.length >= 2 || r.n >= 3);
      const key = h === "h5" ? "w5" : "w10";
      rows.sort((a, b) => wantsBig ? b.mean - a.mean : wantsFall ? a[key] - b[key] : b[key] - a[key]);
      const n = q.ents.n || 10;
      const list = rows.slice(0, n);
      const title = `${wantsBig ? "Largest" : wantsFall ? "Weakest" : "Fastest growing"} aviation markets in ${scope.label} by ${horizonYear(h)}`;
      const first = list[0];
      const reply = first ? `${first.name} ${wantsBig ? "is the largest market" : wantsFall ? "has the weakest momentum" : "has the strongest momentum"} in ${scope.label} with weighted change ${signed(first[key])} by ${horizonYear(h)} across ${first.n} airports. ${list.slice(1, 4).map((r) => r.name).join(", ")} follow.` : "No countries matched.";
      const html = card(esc(title), `<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>#</th><th>Country</th><th class="num">Airports</th><th class="num">Mean now</th><th>Δ 2030</th><th>Δ 2035</th><th class="num">Emerg / decl</th><th>Lead airport</th></tr></thead><tbody>${list.map((r, i) => `<tr><td class="num muted">${i + 1}</td><td><b>${esc(r.name)}</b></td><td class="num">${r.n}</td><td class="num">${f1(r.mean)}</td><td>${arrow(r.w5)}</td><td>${arrow(r.w10)}</td><td class="num">${r.em} / ${r.de}</td><td>${r.top ? apChip(r.top) : ""}</td></tr>`).join("")}</tbody></table></div>`, "Weighted Δ = importance-weighted change across the country's airports (min 3 airports).");
      const actions = [];
      if (first) { const l = idx.byCountry[first.iso] || []; const fit = fitAction(scope.isos ? scope.list : l); if (fit) actions.push(fit); }
      return { reply, html, actions, followups: first ? [`Tell me about ${first.name}'s aviation`, `Top 10 risers in ${first.name} by 2035`, `Which countries decline the most by 2035?`] : ["fastest growing countries", "biggest hubs worldwide", "help"], confidence: 0.85, rows: list.map((r) => r.iso) };
    }
    const r = q.ents.regions[0];
    const list = scope.list;
    if (!list.length) return H.fallback(q);
    const agg = aggregate(list);
    const wChange = h === "h5" ? agg.wChangeH5 : agg.wChangeH10;
    const reply = `${r.name} has ${list.length} tracked airports across ${scope.isos.length} countries, with weighted importance moving ${signed(wChange)} points by ${horizonYear(h)}. ${label(agg.topRiser)} is the fastest riser and ${label(agg.top[0])} the biggest hub.`;
    const html = card(`${esc(r.name)} · region outlook ${horizonYear(h)}`, kpis([{ v: String(list.length), l: "Airports" }, { v: String(scope.isos.length), l: "Countries" }, { v: arrow(wChange), l: `Weighted Δ ${horizonYear(h)}` }, { v: `${agg.nEmergingH10} / ${agg.nDecliningH10}`, l: "Emerging / declining 2035" }]) + `<div class="cp-subtitle">Biggest hubs</div>` + airportTable(idx, agg.top, { horizon: h }) + `<div class="cp-chiprow"><span class="muted">Top riser</span> ${apChip(agg.topRiser)} ${arrow(changeAt(agg.topRiser, h))} <span class="muted">${changeAt(agg.topFaller, h) < 0 ? "Top faller" : "Smallest gain"}</span> ${apChip(agg.topFaller)} ${arrow(changeAt(agg.topFaller, h))}</div>`);
    const actions = [{ type: "highlight", iatas: agg.top.map((a) => a.iata) }];
    const fit = fitAction(list); if (fit) actions.push(fit);
    return { reply, html, actions, followups: [`Fastest growing countries in ${r.name}`, `Top 10 risers in ${r.name} by 2035`, `How many emerging airports in ${r.name}?`], confidence: 0.85 };
  };

  H.route_between = (q) => {
    const idx = q.idx;
    const aps = q.ents.airports.map((e) => e.ap);
    if (aps.length < 2 && q.ctx.selectedAirport && aps.length === 1) aps.unshift(q.ctx.selectedAirport);
    if (aps.length < 2) return { reply: "Tell me the two airports, for example is there a direct flight from DEL to SFO.", html: card("Route finder", `<p>Which two airports?</p><div class="cp-chiprow">${chip("DEL → SFO", { type: "ask", q: "is there a direct flight DEL to SFO" })}${chip("NBO → LIM", { type: "ask", q: "how do I get from Nairobi to Lima" })}</div>`), actions: [], followups: ["is there a direct flight DEL to SFO", "how do I get from Nairobi to Lima", "where does DOH fly"], confidence: 0.5 };
    const [a, b] = aps;
    const direct = (a.routes || []).includes(b.iata) || (b.routes || []).includes(a.iata);
    const path = direct ? [a.iata, b.iata] : shortestPath(idx, a.iata, b.iata);
    let reply, body;
    if (direct) { reply = `Yes, ${label(a)} and ${label(b)} are directly connected in the route network.`; body = `<p class="cp-ok">Direct route found</p>${routeChips(idx, path)}`; }
    else if (path) { const hops = path.length - 1; const via = path.slice(1, -1).map((c) => cityOf(idx.lookup[c])).join(", "); reply = `No direct route, but you can connect ${label(a)} to ${label(b)} in ${hops} hops via ${via}.`; body = `<p class="cp-warn">No direct route · shortest path is ${hops} hops (${hops - 1} connection${hops - 1 === 1 ? "" : "s"})</p>${routeChips(idx, path)}`; }
    else { reply = `I can't find any path between ${label(a)} and ${label(b)} in the tracked route network, so they sit in different components.`; body = `<p class="cp-neg">No path in network</p>`; }
    // alternatives: common hubs
    const common = (a.routes || []).filter((r) => (b.routes || []).includes(r)).map((c) => idx.lookup[c]).filter(Boolean).sort((x, y) => (y.importance_present || 0) - (x.importance_present || 0)).slice(0, 5);
    if (common.length) body += `<div class="cp-subtitle">One-stop options via</div><div class="cp-chiprow">${common.map(apChip).join("")}</div>`;
    body += note(`${a.iata}: ${(a.routes || []).length} routes · ${b.iata}: ${(b.routes || []).length} routes · network: OpenFlights/OpenSky snapshot, not a live schedule.`);
    const html = card(`${esc(a.iata)} → ${esc(b.iata)}`, body);
    const actions = [{ type: "draw_route", a: a.iata, b: b.iata, path: path || [a.iata, b.iata] }, { type: "highlight", iatas: path || [a.iata, b.iata] }];
    return { reply, html, actions, followups: [`Where does ${a.iata} fly?`, `Compare ${a.iata} and ${b.iata}`, `What happens if ${(common[0] || a).iata} closes?`], confidence: 0.9, direct, hops: path ? path.length - 1 : null };
  };

  H.routes_from = (q) => {
    const idx = q.idx;
    const ap = pickAirport(q);
    if (!ap) return H.fallback(q);
    const dests = Array.from(idx.adj[ap.iata] || []).map((c) => idx.lookup[c]).filter(Boolean).sort((x, y) => (y.importance_present || 0) - (x.importance_present || 0));
    const countries = uniq(dests.map((d) => d.country));
    const intl = dests.filter((d) => d.country !== ap.country).length;
    const reply = dests.length ? `${label(ap)} connects to ${dests.length} airports in ${countries.length} countries, ${intl} of them international. Biggest links: ${dests.slice(0, 3).map((d) => cityOf(d)).join(", ")}.` : `${label(ap)} has no routes in the tracked network.`;
    const html = card(`Destinations from ${esc(ap.iata)}`, kpis([{ v: String(dests.length), l: "Destinations" }, { v: String(countries.length), l: "Countries" }, { v: String(intl), l: "International" }, { v: String(dests.length - intl), l: "Domestic" }]) + `<div class="cp-chiprow cp-wrap">${dests.slice(0, 24).map(apChip).join("")}${dests.length > 24 ? `<span class="muted">+${dests.length - 24} more</span>` : ""}</div>`);
    return { reply, html, actions: [{ type: "select_airport", iata: ap.iata }, { type: "fly_to", lat: ap.latitude, lon: ap.longitude, zoom: 4 }], followups: [`What happens if ${ap.iata} closes?`, `Where does ${ap.iata} rank?`, `Airline opportunities from ${ap.iata}`], confidence: 0.9, count: dests.length };
  };

  H.opportunities = (q) => {
    const idx = q.idx, lower = q.norm.lower, opp = q.ctx.opportunities || {};
    const scope = scopeAirports(idx, q.ents);
    const ap = q.ents.airports.length ? q.ents.airports[0].ap : null;
    const n = q.ents.n || 8;
    const inScope = (iso) => !scope.isos || scope.isos.includes(iso);
    const kind = /\b(invest\w*|bet on)\b/.test(lower) ? "investor" : /\b(touris\w*|destinations?|holiday|vacation|leisure)\b/.test(lower) ? "tourism" : "airline";
    let reply, html, actions = [], tab = "radar";
    if (kind === "airline") {
      let rows = (opp.airline_opportunities || []).filter((r) => ap ? (r.origin_iata === ap.iata || r.dest_iata === ap.iata) : (inScope(r.origin_country) || inScope(r.dest_country)));
      if (!rows.length && ap) {
        // client-side fallback: unserved high-importance airports sharing many common connections
        const served = new Set(ap.routes || []);
        rows = idx.airports.filter((d) => d.iata !== ap.iata && !served.has(d.iata) && (d.importance_present || 0) > 70).map((d) => ({ origin_iata: ap.iata, dest_iata: d.iata, origin_city: cityOf(ap), dest_city: cityOf(d), common_connections: (d.routes || []).filter((r) => served.has(r)).length, score: null })).filter((r) => r.common_connections >= 5).sort((a, b) => b.common_connections - a.common_connections).slice(0, n);
      }
      rows = rows.slice(0, n);
      reply = rows.length ? `Top airline candidate ${ap ? "for " + ap.iata : "in " + scope.label}: ${rows[0].origin_city} to ${rows[0].dest_city} with ${rows[0].common_connections} common connections${rows[0].score != null ? " and score " + f1(rows[0].score) : ""}. ${rows.length - 1} more candidates listed.` : `No airline route candidates in the radar for ${ap ? ap.iata : scope.label}.`;
      html = card(`Airline route candidates · ${esc(ap ? ap.iata : scope.label)}`, rows.length ? `<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>#</th><th>Route</th><th class="num">km</th><th class="num">Common hubs</th><th class="num">Score</th></tr></thead><tbody>${rows.map((r, i) => `<tr ${actionAttr({ type: "draw_route", a: r.origin_iata, b: r.dest_iata })} class="cp-row" tabindex="0" role="button"><td class="num muted">${r.rank || i + 1}</td><td><b>${esc(r.origin_iata)}</b> ${esc(r.origin_city)} → <b>${esc(r.dest_iata)}</b> ${esc(r.dest_city)}</td><td class="num">${r.distance_km != null ? Math.round(r.distance_km) : "-"}</td><td class="num">${r.common_connections}</td><td class="num">${r.score != null ? f1(r.score) : "-"}</td></tr>`).join("")}</tbody></table></div>` : note("Nothing in scope."), "Model candidates from a gravity + link-prediction model, not confirmed demand.");
      if (rows.length) actions.push({ type: "draw_route", a: rows[0].origin_iata, b: rows[0].dest_iata, candidate: true }, { type: "highlight", iatas: uniq(rows.flatMap((r) => [r.origin_iata, r.dest_iata])) });
    } else {
      const src = kind === "investor" ? (opp.investor_opportunities || []) : (opp.tourism_opportunities || []);
      let rows = src.filter((r) => inScope(r.country)).slice(0, n);
      if (!rows.length) rows = scope.list.filter((a) => classAt(a, "h5") === "emerging").sort((a, b) => changeAt(b, "h5") - changeAt(a, "h5")).slice(0, n).map((a, i) => ({ rank: i + 1, iata: a.iata, name: a.name, city: cityOf(a), country: a.country, importance_present: a.importance_present, forecast_change_h5: changeAt(a, "h5"), forecast_level_h5: levelAt(a, "h5"), top_driver: (a.forecast_h5 && a.forecast_h5.positive_drivers || [])[0] }));
      reply = rows.length ? `Top ${kind} pick in ${scope.label}: ${rows[0].city} (${rows[0].iata}) with importance ${f1(rows[0].importance_present)} rising ${signed(rows[0].forecast_change_h5)} by 2030, driven by ${DRIVER_HUMAN[rows[0].top_driver] || rows[0].top_driver || "momentum"}.` : `No ${kind} picks in ${scope.label}.`;
      html = card(`${kind === "investor" ? "Investor risers" : "Tourism destinations"} · ${esc(scope.label)}`, rows.length ? `<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>#</th><th>Airport</th><th>Country</th><th class="num">Now</th><th>Δ 2030</th><th>Driver</th></tr></thead><tbody>${rows.map((r, i) => `<tr ${actionAttr({ type: "select_airport", iata: r.iata })} class="cp-row" tabindex="0" role="button"><td class="num muted">${r.rank || i + 1}</td><td><b>${esc(r.iata)}</b> <span class="muted">${esc(r.city)}</span></td><td class="muted">${esc(idx.countryName[r.country] || r.country)}</td><td class="num">${f1(r.importance_present)}</td><td>${arrow(r.forecast_change_h5)}</td><td class="muted">${esc(DRIVER_HUMAN[r.top_driver] || r.top_driver || "")}</td></tr>`).join("")}</tbody></table></div>` : note("Nothing in scope."), "Model candidates, not investment advice.");
      if (rows.length) actions.push({ type: "highlight", iatas: rows.map((r) => r.iata) }); const fit = fitAction(rows.map((r) => idx.lookup[r.iata]).filter(Boolean)); if (fit) actions.push(fit);
    }
    if (/\b(open|show)\b.*\bradar\b/.test(lower)) actions.push({ type: "switch_tab", tab });
    return { reply, html, actions, followups: [kind === "airline" ? `Investor picks in ${scope.label}` : `Airline opportunities ${ap ? "from " + ap.iata : "in " + scope.label}`, `Tourism picks in ${scope.label}`, "Open the opportunity radar"], confidence: 0.85 };
  };

  H.rank_of = (q) => {
    const idx = q.idx;
    const ap = pickAirport(q);
    if (!ap) return q.ents.countries.length ? H.country_overview(q) : H.fallback(q);
    const scope = q.ents.countries.length || q.ents.regions.length ? scopeAirports(idx, q.ents) : null;
    const rankIn = (list, h) => list.slice().sort((a, b) => levelAt(b, h) - levelAt(a, h)).findIndex((a) => a.iata === ap.iata) + 1;
    const all = idx.airports;
    const rp = ap.rank_present || rankIn(all, "present"), r5 = ap.rank_h5 || rankIn(all, "h5"), r10 = ap.rank_h10 || rankIn(all, "h10");
    const home = idx.byCountry[ap.country] || [];
    const hp = rankIn(home, "present"), h10 = rankIn(home, "h10");
    const cont = scope ? rankIn(scope.list, "present") : null;
    const reply = `${label(ap)} ranks #${rp} of ${all.length} airports worldwide today and #${r10} by 2035; within ${idx.countryName[ap.country] || ap.country} it is #${hp} of ${home.length}${scope ? `, and #${cont} in ${scope.label}` : ""}.`;
    const html = card(`Rank of ${esc(ap.iata)}`, kpis([{ v: `#${rp}`, l: "World today" }, { v: `#${r5}`, l: "World 2030" }, { v: `#${r10} ${arrow(rp - r10)}`, l: "World 2035" }, { v: `#${hp} → #${h10}`, l: `${esc(idx.countryName[ap.country] || ap.country)} (${home.length})` }].concat(scope ? [{ v: `#${cont}`, l: `${esc(scope.label)} (${scope.list.length})` }] : [])) + `<div class="cp-bars"><div class="cp-bar-row"><span>Now</span>${barlet(ap.importance_present, 100, "now")}<b>${f1(ap.importance_present)}</b></div><div class="cp-bar-row"><span>2030</span>${barlet(levelAt(ap, "h5"), 100, "h5")}<b>${f1(levelAt(ap, "h5"))}</b></div><div class="cp-bar-row"><span>2035</span>${barlet(levelAt(ap, "h10"), 100, "h10")}<b>${f1(levelAt(ap, "h10"))}</b></div></div>`, "Ranks are by importance level at each horizon (1 = highest).");
    return { reply, html, actions: [{ type: "select_airport", iata: ap.iata }], followups: [`Biggest hubs in ${idx.countryName[ap.country] || ap.country}`, `Why is ${ap.iata} ${CLASS_LABELS[classAt(ap, "h10")].toLowerCase()}?`, `Will ${ap.iata} grow by 2035?`], confidence: 0.88 };
  };

  H.trajectory = (q) => {
    const isAskingDeclining = /\bwhy\s+(is|does)\s+.*(declin|fall|drop|shrink|los)\w*/i.test(q.norm.lower);
    if (isAskingDeclining) return H.airport_details(q);
    const idx = q.idx;
    const aps = q.ents.airports.map((e) => e.ap);
    if (aps.length >= 2) {
      const [a, b] = aps;
      const h = resolveHorizon(q.ents, q.ctx, "h10");
      const gapNow = (a.importance_present || 0) - (b.importance_present || 0), gap5 = levelAt(a, "h5") - levelAt(b, "h5"), gap10 = levelAt(a, "h10") - levelAt(b, "h10");
      const overtakes = gapNow < 0 && gap10 >= 0 ? "by 2035" : gapNow < 0 && gap5 >= 0 ? "by 2030" : null;
      const already = gapNow >= 0;
      const closing = gap10 > gapNow;
      const reply = already ? `${label(a)} is already ahead of ${label(b)} by ${f1(gapNow)} points, and the gap ${gap10 >= gapNow ? "widens" : "narrows"} to ${f1(Math.abs(gap10))} by 2035.` : overtakes ? `Yes, on current forecasts ${label(a)} overtakes ${label(b)} ${overtakes}, closing a ${f1(Math.abs(gapNow))} point gap.` : `Not by 2035: ${label(a)} trails ${label(b)} by ${f1(Math.abs(gapNow))} points today and ${closing ? "only narrows it to" : "the gap widens to"} ${f1(Math.abs(gap10))}.`;
      const rows = [a, b];
      const html = card(`${esc(a.iata)} vs ${esc(b.iata)} trajectory`, airportTable(idx, rows, { horizon: h, rank: false }) + kpis([{ v: signed(-gapNow), l: `Gap now (${b.iata} lead)` }, { v: signed(-gap5), l: "Gap 2030" }, { v: signed(-gap10), l: "Gap 2035" }]) + note(overtakes ? `Crossover ${overtakes}. Horizon-10 bands are indicative only.` : `Horizon-10 forecasts are ${h10ModeLabel()} and indicative only.`));
      return { reply, html, actions: [{ type: "compare", a: a.iata, b: b.iata }], followups: [`Why is ${a.iata} ${CLASS_LABELS[classAt(a, h)].toLowerCase()}?`, `How confident is the ${a.iata} forecast?`, `Compare ${a.iata} and ${b.iata}`], confidence: 0.88, overtakes: Boolean(overtakes) };
    }
    const ap = pickAirport(q);
    if (!ap) return q.ents.countries.length || q.ents.regions.length ? H.top_n(q) : H.fallback(q);
    const h = resolveHorizon(q.ents, q.ctx, "h10");
    const d = changeAt(ap, h);
    const dir = d > 1 ? "grow" : d < -1 ? "decline" : "stay roughly flat";
    const f = fcAt(ap, h) || {};
    const reply = `${label(ap)} is forecast to ${dir}: ${signed(d)} points to ${f1(levelAt(ap, h))} by ${horizonYear(h)}, within a band of ${f1(f.band_low)} to ${f1(f.band_high)}. Class: ${CLASS_LABELS[classAt(ap, h)].toLowerCase()}.`;
    return { reply, html: airportCardHtml(q, ap, h), actions: [{ type: "select_airport", iata: ap.iata }], followups: [`Why is ${ap.iata} ${CLASS_LABELS[classAt(ap, h)].toLowerCase()}?`, `How confident is the ${ap.iata} forecast?`, `Where does ${ap.iata} rank?`], confidence: 0.85 };
  };

  H.uncertainty = (q) => {
    const ap = pickAirport(q);
    if (!ap) return H.methodology(q);
    const h = resolveHorizon(q.ents, q.ctx, "h5");
    const f5 = ap.forecast_h5 || {}, f10 = ap.forecast_h10 || {};
    const ri = ap.reconstruction_interval;
    const reply = `For ${label(ap)} the 2030 band is ${f1(f5.band_low)} to ${f1(f5.band_high)} (${f5.band_label || "calibrated"}) and the 2035 band ${f1(f10.band_low)} to ${f1(f10.band_high)} (${f10.band_label || "indicative only"}). Confidence is ${ap.importance_confidence || "medium"} because the data is ${ap.data_quality || "observed"}.`;
    const html = card(`Uncertainty · ${esc(ap.iata)}`, kpis([{ v: `${f1(f5.band_low)}-${f1(f5.band_high)}`, l: `2030 band · ${esc(f5.band_label || "")}` }, { v: `${f1(f10.band_low)}-${f1(f10.band_high)}`, l: `2035 band · ${esc(f10.band_label || "")}` }, { v: esc(ap.importance_confidence || "medium"), l: "Confidence" }, { v: esc(ap.data_quality || "observed"), l: "Data quality" }]) + note(`${esc(ap.reliability || "")}${ri && ri.length === 2 ? ` Present-day score interval ${f1(ri[0])}-${f1(ri[1])}.` : ""} Horizon-10 intervals achieved ~32% empirical coverage in backtests, so treat them as directional.`));
    return { reply, html, actions: [{ type: "select_airport", iata: ap.iata }], followups: ["How is the importance score computed?", `Why is ${ap.iata} ${CLASS_LABELS[classAt(ap, h)].toLowerCase()}?`, "What does indicative only mean?"], confidence: 0.85 };
  };

  const GLOSSARY = [
    { keys: ["importance score", "importance", "the index", "skyline index", "score"], title: "Importance score", text: "A 0-100 composite of route-network centrality (degree, betweenness, hub links), annual passenger throughput and regional market catchment, scaled so the busiest hubs sit near 100. Reconstructed where traffic is unobserved." },
    { keys: ["emerging"], title: "Emerging", text: "Forecast importance rises materially (top of the change distribution) from a non-hub baseline: a growth opportunity." },
    { keys: ["declining"], title: "Declining", text: "Forecast importance falls materially over the horizon, usually from weak rank trajectory or a sluggish economy." },
    { keys: ["established hub", "hub"], title: "Established hub", text: "Already in the top tier of importance and expected to stay there; growth is limited by scale." },
    { keys: ["stable"], title: "Stable", text: "Change inside the normal band: neither a riser nor a faller." },
    { keys: ["band", "indicative", "rough range", "interval", "coverage", "confidence"], title: "Bands & confidence", text: "Bands are quantile forecasts. Horizon-5 bands are calibrated (~80% coverage); horizon-10 bands reached ~32% coverage in backtests, so they are labelled indicative only. Confidence (high/medium/low) reflects data quality." },
    { keys: ["data quality", "reconstructed", "static only", "observed"], title: "Data quality", text: "Observed = traffic reported; reconstructed = probabilistically inferred from national totals with an interval; static only = no traffic signal, scored from network and geography alone." },
    { keys: ["damped", "damping", "shrinkage", "persistence", "alpha"], title: "Horizon-10 damping", text: "At ten years, predicting zero change (persistence) beats the raw model on MAE because of mean reversion, so the shipped 2035 numbers are shrunk toward today's level (damped) and carry a persistence benchmark." },
    { keys: ["radar", "opportunity radar", "gravity", "link prediction", "candidate"], title: "Opportunity Radar", text: "Unserved city pairs scored by a gravity model plus link prediction (preferential attachment, Adamic-Adar) and forecast momentum. Model candidates, not confirmed demand." },
    { keys: ["data source", "data sources", "dataset", "openflights", "opensky", "where does the data come from", "source"], title: "Data sources", text: "Routes: OpenFlights (2014) and OpenSky (2019-2022). Macro: IMF WEO and UN population projections. Airport metadata: OurAirports. All processed offline into forecasts.json." },
    { keys: ["model", "methodology", "method", "computed", "calculated", "lightgbm", "ridge", "ensemble", "algorithm", "how", "accuracy", "mae", "validation", "limitations", "caveats"], title: "Methodology", text: "An ensemble of LightGBM and Ridge regressors forecasts 5- and 10-year importance change from network, traffic and macro features (IMF/UN projections), with quantile bands, horizon-10 shrinkage and class labels derived from the change distribution." },
  ];

  H.methodology = (q) => {
    const lower = q.norm.lower;
    const hits = GLOSSARY.filter((g) => g.keys.some((k) => lower.includes(k)));
    const chosen = hits.length ? hits.slice(0, 3) : [GLOSSARY[GLOSSARY.length - 1], GLOSSARY[0]];
    const method = (q.ctx.meta && q.ctx.meta.methodology) || "Ensemble of LightGBM and Ridge with IMF and UN forward projections";
    const reply = `${chosen[0].title}: ${chosen[0].text}`;
    const html = card("How Skyline works", chosen.map((g) => `<div class="cp-def"><b>${esc(g.title)}</b><p>${esc(g.text)}</p></div>`).join("") + note(`Methodology: ${esc(method)}. ${q.idx.airports.length.toLocaleString()} airports scored, fully offline in your browser.`));
    const actions = /\b(open|show)\b.*\b(method|intel)/.test(lower) ? [{ type: "switch_tab", tab: "method" }] : [];
    return { reply, html, actions, followups: ["What does emerging mean?", "How confident are the 2035 forecasts?", "What are the data sources?"], confidence: hits.length ? 0.85 : 0.6 };
  };

  H.network_stats = (q) => {
    const idx = q.idx;
    const h = resolveHorizon(q.ents, q.ctx, "present");
    const ns = idx.intel && idx.intel.network_stats && (idx.intel.network_stats[h] || idx.intel.network_stats.present);
    let nodes, edges, avgDeg, top;
    if (ns) { nodes = ns.n_nodes; edges = ns.n_edges; avgDeg = ns.avg_degree; top = (ns.top_betweenness || []).slice(0, 8).map((t) => idx.lookup[t.iata]).filter(Boolean); }
    else {
      nodes = Object.keys(idx.adj).length; edges = Object.values(idx.adj).reduce((s, set) => s + set.size, 0) / 2; avgDeg = nodes ? (2 * edges) / nodes : 0;
      top = idx.airports.slice().sort((a, b) => (idx.adj[b.iata] ? idx.adj[b.iata].size : 0) - (idx.adj[a.iata] ? idx.adj[a.iata].size : 0)).slice(0, 8);
    }
    const reply = `The tracked network has ${Math.round(nodes).toLocaleString()} connected airports and ${Math.round(edges).toLocaleString()} routes, an average of ${f1(avgDeg)} links per airport. ${label(top[0])} is the most central node.`;
    const html = card(`Network statistics · ${horizonLabel(h)}`, kpis([{ v: Math.round(nodes).toLocaleString(), l: "Connected airports" }, { v: Math.round(edges).toLocaleString(), l: "Routes" }, { v: f1(avgDeg), l: "Avg degree" }, { v: ns && ns.giant_component_share != null ? f1(100 * ns.giant_component_share) + "%" : String(idx.airports.length.toLocaleString()), l: ns && ns.giant_component_share != null ? "Giant component" : "Airports in index" }].concat(ns && ns.density != null ? [{ v: ns.density.toFixed(4), l: "Density" }, { v: f1(ns.avg_clustering), l: "Clustering" }] : [])) + `<div class="cp-subtitle">${ns ? "Highest betweenness" : "Most connected"}</div><div class="cp-chiprow cp-wrap">${top.map(apChip).join("")}</div>`);
    return { reply, html, actions: [{ type: "highlight", iatas: top.map((a) => a.iata) }], followups: ["Most critical hubs", "What happens if DXB closes?", "Most connected airports in Europe"], confidence: 0.85 };
  };

  H.resilience = (q) => {
    const idx = q.idx, lower = q.norm.lower;
    const ap = pickAirport(q);
    if (!ap || /\b(most critical|critical hubs?|which hubs?|fragile|most vulnerable|single point)\b/.test(lower) && !q.ents.airports.length) {
      const res = idx.intel && idx.intel.resilience;
      const wantsFragile = /\b(fragile|vulnerable|spoke|dependen)\b/.test(lower);
      let rows;
      if (res && (wantsFragile ? res.fragile_spokes : res.critical_hubs)) rows = (wantsFragile ? res.fragile_spokes : res.critical_hubs).slice(0, q.ents.n || 10).map((c) => ({ ap: idx.lookup[c], row: res.airports.find((x) => x.iata === c) })).filter((r) => r.ap);
      else {
        const dg = (a) => (idx.adj[a.iata] ? idx.adj[a.iata].size : 0);
        if (wantsFragile) {
          rows = idx.airports.filter((a) => dg(a) >= 1 && dg(a) <= 2).sort((a, b) => (b.importance_present || 0) - (a.importance_present || 0)).slice(0, q.ents.n || 10).map((a) => ({ ap: a, imp: { disconnected: dg(a), articulation: dg(a) === 1, reachLossPct: 0 } }));
        } else {
          const cand = idx.airports.filter((a) => dg(a) >= 40).sort((a, b) => dg(b) - dg(a)).slice(0, 40);
          rows = cand.map((a) => ({ ap: a, imp: removalImpact(idx, a.iata) })).sort((x, y) => (y.imp.disconnected - x.imp.disconnected) || (dg(y.ap) - dg(x.ap))).slice(0, q.ents.n || 10);
        }
      }
      const first = rows[0];
      const reply = first ? (wantsFragile && !first.row ? `${label(first.ap)} is the most exposed spoke: it depends on just ${first.imp.disconnected} network link${first.imp.disconnected === 1 ? "" : "s"}. ${rows.slice(1, 4).map((r) => r.ap.iata).join(", ")} follow.` : `${label(first.ap)} is the most ${wantsFragile ? "fragile spoke" : "critical hub"}: removing it ${first.row ? `cuts ${f1(first.row.removal_reach_loss_pct)}% of reachable pairs` : `strands ${first.imp.disconnected} airports`}. ${rows.slice(1, 4).map((r) => r.ap.iata).join(", ")} follow.`) : "No resilience data.";
      const html = card(wantsFragile ? "Most fragile spokes" : "Most critical hubs", `<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>#</th><th>Airport</th><th class="num">Links</th><th class="num">${first && first.row ? "Reach loss %" : (wantsFragile ? "Links depended on" : "Stranded if removed")}</th><th>${first && first.row ? "Class" : "Articulation"}</th></tr></thead><tbody>${rows.map((r, i) => `<tr ${actionAttr({ type: "ask", q: `what happens if ${r.ap.iata} closes` })} class="cp-row" tabindex="0" role="button"><td class="num muted">${i + 1}</td><td><b>${esc(r.ap.iata)}</b> <span class="muted">${esc(cityOf(r.ap))}</span></td><td class="num">${idx.adj[r.ap.iata] ? idx.adj[r.ap.iata].size : 0}</td><td class="num">${r.row ? f1(r.row.removal_reach_loss_pct) : r.imp.disconnected}</td><td>${r.row ? `<span class="cp-badge cp-badge-${esc(r.row.vulnerability_class)}">${esc(r.row.vulnerability_class)}</span>` : (r.imp.articulation ? "yes" : "no")}</td></tr>`).join("")}</tbody></table></div>`, first && first.row ? "From intelligence.json resilience analysis." : "Client-side BFS: airports left unreachable from the network when the hub is removed.");
      return { reply, html, actions: [{ type: "highlight", iatas: rows.map((r) => r.ap.iata) }], followups: [`What happens if ${first ? first.ap.iata : "DXB"} closes?`, "Network statistics", "Most connected airports"], confidence: 0.82 };
    }
    const imp = removalImpact(idx, ap.iata);
    const nbrs = idx.adj[ap.iata] ? idx.adj[ap.iata].size : 0;
    const totalConnected = Object.keys(idx.adj).length;
    const reply = imp.source === "intelligence" ? `If ${label(ap)} closed, ${f1(imp.reachLossPct)}% of airport pairs would lose connectivity and ${imp.disconnected} airports would be cut off entirely; it is classed ${imp.vulnerability} with redundancy ${f1(imp.redundancy)} out of 100.` : `If ${label(ap)} closed, ${nbrs} direct links would vanish, ${imp.disconnected} airport${imp.disconnected === 1 ? "" : "s"} would be cut off from the network entirely (${f1(imp.reachLossPct)}% of airport pairs lose connectivity), and ${nbrs - imp.disconnected} neighbours would have to reroute through other hubs.`;
    const deps = (imp.deps || []).map((d) => ({ ap: idx.lookup[d.iata], share: d.share })).filter((d) => d.ap);
    const stranded = (imp.strandedList || []).map((c) => idx.lookup[c]).filter(Boolean).slice(0, 12);
    const html = card(`Closure scenario · ${esc(ap.iata)}`, kpis([{ v: `${f1(imp.reachLossPct)}%`, l: "Pairs losing connectivity" }, { v: String(imp.disconnected), l: "Airports cut off" }, { v: String(nbrs), l: "Direct links lost" }, { v: imp.source === "intelligence" ? `${f1(imp.redundancy)}` : (imp.articulation ? "Yes" : "No"), l: imp.source === "intelligence" ? "Redundancy (0-100)" : "Articulation point" }]) + (imp.vulnerability ? `<div class="cp-chiprow"><span class="muted">Vulnerability</span> <span class="cp-badge cp-badge-${esc(imp.vulnerability)}">${esc(imp.vulnerability)}</span></div>` : "") + (deps.length ? `<div class="cp-subtitle">Most dependent partners</div><div class="cp-chiprow cp-wrap">${deps.map((d) => `${apChip(d.ap)}<span class="muted">${f1(100 * d.share)}%</span>`).join("")}</div>` : "") + (stranded.length ? `<div class="cp-subtitle">Would be cut off</div><div class="cp-chiprow cp-wrap">${stranded.map(apChip).join("")}</div>` : "") + note(`${totalConnected.toLocaleString()} airports in the connected network. Static route snapshot, so real-world rerouting capacity is not modelled.`));
    const actions = [{ type: "select_airport", iata: ap.iata }, { type: "highlight", iatas: [ap.iata].concat(stranded.map((a) => a.iata)) }];
    return { reply, html, actions, followups: ["Most critical hubs", `Where does ${ap.iata} fly?`, `Compare ${ap.iata} with ${ap.iata === "DXB" ? "DOH" : "DXB"}`], confidence: 0.88 };
  };

  H.scenario = (q) => {
    const idx = q.idx, lower = q.norm.lower;
    const sc = idx.intel && idx.intel.scenario;
    const h = resolveHorizon(q.ents, q.ctx, "h5");
    const scope = scopeAirports(idx, q.ents);
    const m = lower.match(/(-?\d+(?:\.\d+)?)\s?(%|percent|pp|points?|pct)/);
    const mag = m ? parseFloat(m[1]) * (/\b(slower|lower|less|falls?|drops?|shrink|recession|decline)\b/.test(lower) ? -1 : 1) : (/\b(recession|collapse|crash|slower|lower|falls?|drops?)\b/.test(lower) ? -2 : 2);
    const feature = /\btouris/.test(lower) ? "tourism_growth_1y" : /\bpopulation\b/.test(lower) ? "pop_growth_1y" : /\btraffic|passengers?\b/.test(lower) ? "traffic_growth_1y" : /\broutes?\b/.test(lower) ? "of_routes_total" : "gdp_growth_1y";
    const featureName = { gdp_growth_1y: "GDP growth", tourism_growth_1y: "tourism growth", pop_growth_1y: "population growth", traffic_growth_1y: "traffic growth", of_routes_total: "route count" }[feature];
    const sens = sc && (h === "h10" ? sc.sensitivities_h10 : sc.sensitivities_h5);
    const coef = sens && sens[feature] != null ? sens[feature] : ({ gdp_growth_1y: 0.9, tourism_growth_1y: 0.35, pop_growth_1y: 0.6, traffic_growth_1y: 0.5, of_routes_total: 0.08 }[feature]);
    const delta = coef * mag;
    const list = scope.list;
    const agg = aggregate(list);
    const reply = `A ${signed(mag)} ${feature === "of_routes_total" ? "route" : "point"} shift in ${featureName} moves forecast importance by roughly ${signed(delta)} points per airport in ${scope.label} by ${horizonYear(h)}${agg ? `, lifting the mean from ${f1(h === "h5" ? agg.meanH5 : agg.meanH10)} to ${f1((h === "h5" ? agg.meanH5 : agg.meanH10) + delta)}` : ""}. ${sc ? "Based on the linear surrogate sensitivities." : "Illustrative elasticity, as the scenario model is not loaded."}`;
    const top = agg ? agg.top.slice(0, 5) : [];
    const html = card(`Scenario · ${esc(featureName)} ${signed(mag)} in ${esc(scope.label)}`, kpis([{ v: signed(delta), l: `Δ importance / airport (${horizonYear(h)})` }, { v: String(list.length), l: "Airports affected" }, { v: agg ? f1((h === "h5" ? agg.meanH5 : agg.meanH10) + delta) : "-", l: "New mean level" }, { v: coef != null ? f1(coef) : "-", l: `Sensitivity per unit` }]) + (top.length ? `<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Airport</th><th class="num">Base ${horizonYear(h)}</th><th class="num">Scenario</th><th>Δ</th></tr></thead><tbody>${top.map((a) => `<tr ${actionAttr({ type: "select_airport", iata: a.iata })} class="cp-row" tabindex="0" role="button"><td><b>${esc(a.iata)}</b> <span class="muted">${esc(cityOf(a))}</span></td><td class="num">${f1(levelAt(a, h))}</td><td class="num">${f1(Math.min(100, levelAt(a, h) + delta))}</td><td>${arrow(delta)}</td></tr>`).join("")}</tbody></table></div>` : "") + note(sc ? esc(sc.method || "Linear surrogate of the forecast model.") : "Uses a built-in illustrative elasticity; load intelligence.json for fitted sensitivities." + (sc && sc.units && sc.units[feature] ? ` Units: ${esc(sc.units[feature])}.` : "")));
    const actions = [{ type: "set_horizon", horizon: h }]; const fit = fitAction(list); if (fit && scope.isos) actions.push(fit);
    if (/\bopen\b.*\bscenario\b/.test(lower)) actions.push({ type: "switch_tab", tab: "scenario" });
    return { reply, html, actions, followups: [`If ${scope.label === "the world" ? "India" : scope.label}'s tourism grows 3% faster`, `Top 10 risers in ${scope.label} by 2035`, "Open the scenario view"], confidence: sc ? 0.85 : 0.7 };
  };

  H.navigate = (q) => {
    const lower = q.norm.lower;
    const actions = [];
    let reply = "";
    if (/\b(radar|opportunit)/.test(lower)) { actions.push({ type: "switch_tab", tab: "radar" }); reply = "Opening the Opportunity Radar."; }
    else if (/\b(intel(ligence)?|country (view|ranking)|rankings view)\b/.test(lower)) { actions.push({ type: "switch_tab", tab: "intel" }); reply = "Opening the Intelligence view."; }
    else if (/\bscenario\b/.test(lower)) { actions.push({ type: "switch_tab", tab: "scenario" }); reply = "Opening the Scenario view."; }
    else if (/\bmethod/.test(lower)) { actions.push({ type: "switch_tab", tab: "method" }); reply = "Opening the Methodology view."; }
    else if (/\b(map view|map tab|the map|back to map|^map$)\b/.test(lower) || /^map$/.test(lower)) { actions.push({ type: "switch_tab", tab: "map" }); reply = "Back to the map."; }
    if (/\b(compare drawer|comparison)\b/.test(lower) && !actions.length) { actions.push({ type: "compare", a: (q.ctx.selectedAirport || {}).iata || "SIN", b: "DXB" }); reply = "Opening the comparison drawer."; }
    if (/\b(reset|clear)\b/.test(lower)) { actions.push({ type: "reset" }); reply = (reply ? reply + " " : "") + "Map view and filters reset."; }
    if (/\bzoom (in|out)\b/.test(lower)) { actions.push({ type: "zoom", direction: /zoom in/.test(lower) ? "in" : "out" }); reply = (reply ? reply + " " : "") + `Zooming ${/zoom in/.test(lower) ? "in" : "out"}.`; }
    if (q.ents.horizon && /\b(switch|set|change|horizon|use|go to|show|view|years?|2030|2035|current|present|baseline)\b/.test(lower)) { actions.push({ type: "set_horizon", horizon: q.ents.horizon }); reply = (reply ? reply + " " : "") + `Horizon set to ${horizonLabel(q.ents.horizon)}.`; }
    const classes = q.ents.classes.map((c) => c.cls);
    if (classes.length && /\b(only|just|filter|hide|limit)\b/.test(lower)) { actions.push({ type: "filter", classes }); reply = (reply ? reply + " " : "") + `Filtering the map to ${classes.map((c) => CLASS_LABELS[c].toLowerCase()).join(" and ")} airports.`; }
    if (q.ents.countries.length && /\b(zoom|fly|go|show|take me|center)\b/.test(lower) && !actions.some((a) => a.type === "fit_bounds")) { const fit = fitAction(scopeAirports(q.idx, q.ents).list); if (fit) { actions.push(fit); reply = (reply ? reply + " " : "") + `Zooming to ${q.ents.countries[0].name}.`; } }
    if (!actions.length) {
      if (q.ents.airports.length) return H.show_airport(q);
      return H.help(q);
    }
    return { reply, html: card("Navigation", `<p>${esc(reply)}</p><div class="cp-chiprow">${actions.map((a) => `<span class="cp-badge cp-badge-nav">${esc(a.type.replace(/_/g, " "))}${a.horizon ? " " + esc(horizonYear(a.horizon)) : ""}${a.tab ? " " + esc(a.tab) : ""}</span>`).join("")}</div>`), actions, followups: ["Top 10 risers by 2035", "What happens if DXB closes?", "Compare SIN and DXB"], confidence: 0.9 };
  };

  H.followup_horizon = (q) => {
    const hist = (q.ctx.history || []).slice().reverse().find((hh) => hh.query && hh.intent && hh.intent !== "greeting" && hh.intent !== "help");
    const h = q.ents.horizon;
    if (hist && hist.query) {
      const stripped = hist.query.replace(/\b(by|in|at|for)?\s*(2030|2035|2025|\+?5 years|\+?10 years|today|now|current)\b/gi, "").replace(/\s+/g, " ").trim();
      const sub = answer(`${stripped} by ${horizonYear(h)}`, Object.assign({}, q.ctx, { history: [] }));
      sub.intent = sub.intent; sub.chained = true;
      return sub;
    }
    return { reply: `Horizon set to ${horizonLabel(h)}.`, html: card("Horizon", `<p>Showing ${esc(horizonLabel(h))}.</p>`), actions: [{ type: "set_horizon", horizon: h }], followups: [`Top 10 risers by ${horizonYear(h)}`, "Fastest growing countries", "Compare SIN and DXB"], confidence: 0.7 };
  };

  H.fallback = (q) => {
    const idx = q.idx;
    const ents = q.ents;
    // Prefer something useful from entities
    if (ents.airports.length >= 2) return Object.assign(H.compare(q), { confidence: 0.55, intent: "compare" });
    if (ents.airports.length === 1) return Object.assign(H.show_airport(q), { confidence: 0.6, intent: "show_airport" });
    if (ents.countries.length) return Object.assign(H.country_overview(q), { confidence: 0.6, intent: "country_overview" });
    if (ents.regions.length) return Object.assign(H.region_overview(q), { confidence: 0.6, intent: "region_overview" });
    if (ents.classes.length || ents.n != null) return Object.assign(H.top_n(q), { confidence: 0.55, intent: "top_n" });
    if (ents.refersToSelected && q.ctx.selectedAirport) return Object.assign(H.airport_details(q), { confidence: 0.5, intent: "airport_details" });
    // Try a fuzzy airport guess on the longest token
    const sel = q.ctx.selectedAirport;
    const understood = [];
    if (ents.horizon) understood.push(`horizon ${horizonYear(ents.horizon)}`);
    const reply = `I couldn't map that to the aviation data yet, but I can answer questions about any airport, country, region, route, ranking, forecast or scenario. Try one of the suggestions.`;
    const sugg = ["Which Indian airports grow most by 2035?", "Is there a direct route DEL to SFO?", sel ? `Why is ${sel.iata} ${CLASS_LABELS[classAt(sel, "h5")].toLowerCase()}?` : "What happens if DXB closes?"];
    const html = card("Let me help with that", `<p>${esc(reply)}</p>${understood.length ? note("Understood: " + esc(understood.join(", "))) : ""}<div class="cp-help-group">${sugg.map((e) => `<button type="button" class="cp-followup" data-copilot-ask="${esc(e)}">${esc(e)}</button>`).join("")}</div>${note('Say "help" for the full list of things I can do.')}`);
    return { reply, html, actions: [], followups: sugg, confidence: 0.2 };
  };

  // ---------------------------------------------------------------------------
  // 8. Orchestration
  // ---------------------------------------------------------------------------
  function splitParts(lower) {
    // Multi-part: "compare DEL and BOM and show on map", "show DEL then compare it with DXB"
    const parts = lower.split(/\s*(?:,\s*then\s+|\bthen\b|\band then\b|\balso\b|;|\band (?=show|open|switch|zoom|draw|put|set|compare|tell|highlight|go|take))\s*/).map((s) => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts : [lower];
  }

  function resolveFollowupText(text, ctx) {
    text = String(text).trim().replace(/[?!.;:]+$/g, "");
    const lower = text.toLowerCase().trim();
    const sel = ctx.selectedAirport;
    const lastQ = (ctx.history || []).slice().reverse().find((h) => h.query && h.intent !== "greeting" && h.intent !== "help" && h.intent !== "fallback");
    const lastAp = lastQ && lastQ.entities && lastQ.entities.airports && lastQ.entities.airports[0];
    const ref = lastAp || (sel && sel.iata);
    let out = text;
    if (ref) out = out.replace(/\b(it|this airport|that airport|this one|that one|the airport|the same airport)\b/gi, ref);
    if (/^(why|why\?|how come|explain|explain why)$/.test(lower) && ref) out = `why is ${ref} ${lastQ && lastQ.intent === "resilience" ? "critical" : ""}`.trim();
    if (/^(and|what about|how about)\s+(in\s+|at\s+|by\s+|for\s+)?(2030|2035|\+?5|\+?10|today|now|current)( years)?$/.test(lower) && lastQ) {
      const h = extractHorizon(lower, []);
      const stripped = lastQ.query.replace(/\b(by|in|at|for)?\s*(2030|2035|2025|\+?5 years|\+?10 years|today|now|current)\b/gi, "").replace(/\s+/g, " ").trim();
      out = `${stripped} by ${horizonYear(h || "h10")}`;
    } else if (/^(and|what about|how about)\s+/.test(lower) && lastQ && lastQ.intent) {
      // "and in Africa?", "what about Vietnam?", "and DXB?"
      const rest = lower.replace(/^(and|what about|how about)\s+(in|for|at|about)?\s*/, "");
      if (lastQ.intent === "top_n" || lastQ.intent === "count" || lastQ.intent === "country_overview" || lastQ.intent === "region_overview") {
        const prevScope = (lastQ.entities && ((lastQ.entities.countries || [])[0] || (lastQ.entities.regions || [])[0])) || null;
        out = prevScope ? lastQ.query.replace(new RegExp(prevScope, "i"), rest) : `${lastQ.query} in ${rest}`;
      } else if (/^[a-z]{3}$/.test(rest) || /^[a-z ]+$/.test(rest)) {
        out = lastQ.intent === "compare" && ref ? `compare ${ref} and ${rest}` : lastQ.query.replace(ref || /$^/, rest);
        if (out === lastQ.query) out = `${lastQ.intent === "routes_from" ? "where does" : "tell me about"} ${rest}${lastQ.intent === "routes_from" ? " fly" : ""}`;
      }
    }
    const cm = lower.match(/^(compare|vs|versus|against)\s+(?:it\s+)?(?:with|to|and|vs)?\s*(.+)$/);
    if (cm && ref) {
      const other = cm[2].trim();
      if (other && !/\b(and|vs|with|versus|to|or)\b/.test(other) && other.toUpperCase() !== ref) out = `compare ${ref} and ${other}`;
    }
    return out;
  }

  function answerOne(text, ctx, idx) {
    const norm = normalise(text);
    if (!norm.lower) return Object.assign(H.help({ norm, ents: { airports: [], countries: [], regions: [], classes: [] }, ctx, idx }), { intent: "help" });

    // Guardrail: Question names a year outside 2025, 2030, 2035
    const yearMatches = norm.lower.match(/\b(19\d\d|20\d\d)\b/g);
    if (yearMatches) {
      const unsupported = yearMatches.filter((y) => y !== "2025" && y !== "2030" && y !== "2035");
      if (unsupported.length > 0) {
        const reply = "Forecasts are only available for 2025, 2030, and 2035.";
        return {
          reply,
          html: card("Available Horizons", `<p>${esc(reply)}</p>`),
          actions: [],
          followups: ["Show 2025 baseline", "Show 2030 (+5y)", "Show 2035 (+10y)"],
          confidence: 0.95,
          intent: "unsupported_year",
          entities: { airports: [], countries: [], regions: [], horizon: null, n: null, classes: [] },
          ranked: [{ intent: "unsupported_year", score: 10 }],
        };
      }
    }

    // Guardrail: Question asks for something we do not model (passenger counts, delays, prices, fares)
    if (/\b(passenger(\s+counts?|\s+numbers?|\s+volumes?)?|passengers|delays?|on-time|ticket\s+prices?|flight\s+prices?|prices?|airfares?|fares?|ticket\s+costs?)\b/i.test(norm.lower)) {
      const reply = "We do not model passenger counts, flight delays, ticket prices, or airfares.";
      return {
        reply,
        html: card("Unmodelled Data", `<p>${esc(reply)}</p>`),
        actions: [],
        followups: ["Top 10 hubs in Europe", "Fastest growing airports in Asia", "Help"],
        confidence: 0.95,
        intent: "unmodelled",
        entities: { airports: [], countries: [], regions: [], horizon: null, n: null, classes: [] },
        ranked: [{ intent: "unmodelled", score: 10 }],
      };
    }

    // Guardrail: Question is off topic (capitals, jokes, general knowledge)
    if (/\b(capital\s+of|tell\s+(me\s+)?a?\s*joke|jokes?\b|who\s+(is|was)\s+|president\s+of|prime\s+minister\s+of|meaning\s+of\s+life|recipe\s+for|write\s+a\s+(poem|song|story)|who\s+won\s+the\b)/i.test(norm.lower)) {
      const reply = "The assistant only covers the aviation data.";
      return {
        reply,
        html: card("Aviation Assistant", `<p>${esc(reply)}</p>`),
        actions: [],
        followups: ["Which Indian airports grow most by 2035?", "Is there a direct route DEL to SFO?", "What happens if DXB closes?"],
        confidence: 0.95,
        intent: "off_topic",
        entities: { airports: [], countries: [], regions: [], horizon: null, n: null, classes: [] },
        ranked: [{ intent: "off_topic", score: 10 }],
      };
    }

    const ents = extractEntities(idx, norm, ctx);
    const cls = scoreIntents(norm, ents, ctx);
    const q = { norm, ents, ctx, idx, cls };
    let intent = cls.intent;
    if (!H[intent]) intent = "fallback";
    let res;
    try { res = H[intent](q); } catch (err) { res = H.fallback(q); res.error = String(err && err.message || err); intent = "fallback"; }
    res.intent = res.intent || intent;
    res.confidence = res.confidence != null ? Math.min(res.confidence, cls.confidence + 0.25) : cls.confidence;
    res.entities = { airports: ents.airports.map((e) => e.ap.iata), countries: ents.countries.map((c) => c.iso), regions: ents.regions.map((r) => r.key), horizon: ents.horizon, n: ents.n, classes: ents.classes.map((c) => c.cls) };
    res.ranked = cls.ranked.slice(0, 3);
    return res;
  }

  function answer(text, ctx) {
    ctx = ctx || {};
    h10Mode = ctx.h10Mode === "raw" ? "raw" : "damped";
    h10Alpha = ctx.intelligence && ctx.intelligence.horizon10_shrinkage && ctx.intelligence.horizon10_shrinkage.best_alpha != null ? ctx.intelligence.horizon10_shrinkage.best_alpha : (ctx.meta && ctx.meta.horizon10_evaluation && ctx.meta.horizon10_evaluation.damping_factor != null ? ctx.meta.horizon10_evaluation.damping_factor : null);
    const idx = buildIndex(ctx);
    const resolved = resolveFollowupText(String(text || ""), ctx);
    const norm0 = normalise(resolved);
    const parts = splitParts(norm0.lower);
    let results;
    if (parts.length > 1) {
      results = parts.map((p) => answerOne(p, ctx, idx));
      // Merge: primary = first result with highest confidence that is not navigate; actions from all
      const primary = results.slice().sort((a, b) => (b.intent === "navigate" ? -1 : 0) + b.confidence - ((a.intent === "navigate" ? -1 : 0) + a.confidence))[0];
      const actions = [];
      results.forEach((r) => (r.actions || []).forEach((a) => { if (!actions.some((x) => JSON.stringify(x) === JSON.stringify(a))) actions.push(a); }));
      // "show on map" → draw route / highlight for airports in the primary result
      if (/\b(map|draw|plot|highlight)\b/.test(norm0.lower) && primary.entities && primary.entities.airports.length >= 2 && !actions.some((a) => a.type === "draw_route")) actions.push({ type: "draw_route", a: primary.entities.airports[0], b: primary.entities.airports[1] }, { type: "highlight", iatas: primary.entities.airports });
      const html = results.map((r) => r.html).join("");
      return Object.assign({}, primary, { reply: results.map((r) => r.reply).join(" ").slice(0, 600), html, actions, followups: primary.followups, confidence: Math.min(...results.map((r) => r.confidence)), parts: results.map((r) => r.intent), multi: true });
    }
    const res = answerOne(resolved, ctx, idx);
    if (resolved !== String(text)) res.resolvedQuery = resolved;
    return res;
  }

  // Compact context for an optional external LLM (bring-your-own-key mode)
  function compactContext(text, ctx, maxBytes) {
    const idx = buildIndex(ctx);
    const norm = normalise(text);
    const ents = extractEntities(idx, norm, ctx);
    const slim = (ap) => ({ iata: ap.iata, city: cityOf(ap), country: ap.country, now: f1(ap.importance_present), y2030: f1(levelAt(ap, "h5")), y2035: f1(levelAt(ap, "h10")), cls5: classAt(ap, "h5"), cls10: classAt(ap, "h10"), routes: (ap.routes || []).length, drivers: (ap.forecast_h5 && ap.forecast_h5.positive_drivers || []).slice(0, 2), headwinds: (ap.forecast_h5 && ap.forecast_h5.negative_drivers || []).slice(0, 2) });
    const out = { entities: { airports: ents.airports.map((e) => e.ap.iata), countries: ents.countries.map((c) => c.iso), regions: ents.regions.map((r) => r.key), horizon: ents.horizon, n: ents.n, classes: ents.classes.map((c) => c.cls) }, selected: ctx.selectedAirport ? slim(ctx.selectedAirport) : null, airports: ents.airports.slice(0, 4).map((e) => slim(e.ap)), scope: [] };
    const scope = scopeAirports(idx, ents);
    if (scope.isos) {
      const agg = aggregate(scope.list);
      out.scope_summary = agg ? { label: scope.label, n: agg.n, mean_now: f1(agg.meanNow), weighted_change_2035: f1(agg.wChangeH10), emerging_2035: agg.nEmergingH10, declining_2035: agg.nDecliningH10 } : null;
      out.scope = scope.list.slice().sort((a, b) => changeAt(b, "h10") - changeAt(a, "h10")).slice(0, 12).map(slim);
    }
    let s = JSON.stringify(out);
    while (s.length > (maxBytes || 6000) && out.scope.length) { out.scope.pop(); s = JSON.stringify(out); }
    return out;
  }

  return {
    answer, compactContext, normalise, levenshtein, extractHorizon,
    _internals: { buildIndex, extractEntities, scoreIntents, resolveFollowupText, splitParts, shortestPath, removalImpact, aggregate, COUNTRY_TABLE, REGION_TABLE, CLASS_LABELS, levelAt, changeAt, classAt },
    version: "1.0.0",
  };
});
