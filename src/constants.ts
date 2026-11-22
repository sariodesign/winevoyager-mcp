// Static facts about the WineVoyager API that the tools rely on.
// Keep them in sync with https://api.winevoyager.tours/openapi.json.

export const DEFAULT_BASE_URL = 'https://api.winevoyager.tours'

export const DEVELOPERS_URL = 'https://www.winevoyager.tours/developers'
export const SUPPORT_EMAIL = 'support@winevoyager.tours'

/** CC-BY 4.0 attribution required wherever the data is used. */
export const ATTRIBUTION = `Data by WineVoyager (${DEVELOPERS_URL}). Always check the official disciplinare in force.`

/** The 20 Italian regions, spelled as the API stores them. The `region` filter is an exact match. */
export const REGIONS = [
    'Abruzzo',
    'Basilicata',
    'Calabria',
    'Campania',
    'Emilia-Romagna',
    'Friuli-Venezia Giulia',
    'Lazio',
    'Liguria',
    'Lombardia',
    'Marche',
    'Molise',
    'Piemonte',
    'Puglia',
    'Sardegna',
    'Sicilia',
    'Toscana',
    'Trentino-Alto Adige',
    'Umbria',
    "Valle d'Aosta",
    'Veneto',
] as const

export const COLORS = ['red', 'white', 'rose'] as const
export const CLASSIFICATIONS = ['DOCG', 'DOC'] as const

/** Denominations returned with the full record even without an API key. */
export const SHOWCASE_IDS = [
    'barolo',
    'barbaresco',
    'brunello-di-montalcino',
    'chianti-classico',
    'amarone-della-valpolicella',
    'taurasi',
    'franciacorta',
    'conegliano-valdobbiadene-prosecco',
] as const
