"""Rules-based expense categorization engine with Claude AI fallback."""

from __future__ import annotations

import os
import re

EXPENSE_CATEGORIES: dict[str, dict] = {
    "mortgage": {
        "name": "Mortgage / Rent",
        "type": "fixed",
        "keywords": [
            "MORTGAGE", "HOME LOAN", "QUICKEN LOANS", "ROCKET MORTGAGE",
            "RENT PAYMENT", "APARTMENT RENT", "PROPERTY MGMT", "LEASE PMT",
            "HOUSING", "HOA ", "CONDO FEE", "ESCROW",
            "LOANDEPOT", "LOANDEPO", "NSM DBAMR", "MR. COOPER", "MR COOPER",
            "NATIONSTAR", "RUSHMORE LOAN",
        ],
    },
    "utilities": {
        "name": "Utilities",
        "type": "fixed",
        "keywords": [
            "ELECTRIC", "GAS BILL", "WATER BILL", "SEWER", "PSE&G", "PSEG",
            "CON EDISON", "CONED", "DUKE ENERGY", "XCEL ENERGY", "DOMINION",
            "NATIONAL GRID", "T-MOBILE", "VERIZON", "AT&T", "SPRINT",
            "COMCAST", "SPECTRUM", "INTERNET", "CABLE", "WASTE MGMT",
            "XFINITY", "FIOS", "CENTURYLINK", "WINDSTREAM", "FRONTIER COMM",
            "CRICKET", "BOOST MOBILE", "MINT MOBILE", "GOOGLE FI",
            "TRASH", "GARBAGE", "RECYCLING", "ENERGY",
            "PUGET SOUND ENER", "PUGET ENERGY", "PUDNO",
            "ALDERWOOD WATER", "WASTEWATER", "WASTE MANAGEMENT",
        ],
    },
    "insurance": {
        "name": "Insurance",
        "type": "fixed",
        "keywords": [
            "INSURANCE", "GEICO", "STATE FARM", "ALLSTATE", "PROGRESSIVE",
            "LIBERTY MUTUAL", "USAA", "NATIONWIDE", "FARMERS INS",
            "METLIFE", "PRUDENTIAL", "AFLAC", "CIGNA", "AETNA",
            "BLUE CROSS", "BCBS", "UNITED HEALTH", "HUMANA", "KAISER",
            "ANTHEM",
            "AMERICAN FAMILY", "TRANSAMERICA", "AMERITAS",
        ],
    },
    "auto_loan": {
        "name": "Auto / Car Payment",
        "type": "fixed",
        "keywords": [
            "AUTO LOAN", "CAR PAYMENT", "CAR LOAN", "VEHICLE PAYMENT",
            "TOYOTA FINANCIAL", "HONDA FINANCIAL", "FORD CREDIT",
            "ALLY AUTO", "CAPITAL ONE AUTO", "GM FINANCIAL",
            "CARMAX", "CARVANA",
            "BMW BANK", "BMWFS", "BMW FINANCIAL",
        ],
    },
    "loan_payment": {
        "name": "Loan Payment",
        "type": "fixed",
        "keywords": [
            "LOAN PAYMT", "LOAN PMT", "LOAN PAYMENT",
            "BOEING EMP CR", "CAL BANK TRUST",
        ],
    },
    "food_dining": {
        "name": "Food & Dining",
        "type": "variable",
        "keywords": [
            "RESTAURANT", "DOORDASH", "UBER EATS", "GRUBHUB", "MCDONALD",
            "STARBUCKS", "DUNKIN", "CHIPOTLE", "PANERA", "SUBWAY",
            "PIZZA", "TACO BELL", "WENDYS", "CHICK-FIL-A", "BURGER KING",
            "POPEYES", "KFC", "DINER", "CAFE", "BISTRO", "SUSHI",
            "THAI", "CHINESE FOOD", "SEAMLESS", "POSTMATES",
            "PANDA EXPRESS", "FIVE GUYS", "IN-N-OUT", "WINGSTOP",
            "SONIC DRIVE", "ARBY", "JACK IN THE BOX", "IHOP", "DENNY",
            "APPLEBEE", "OLIVE GARDEN", "CHILI'S", "RED LOBSTER",
            "OUTBACK", "CRACKER BARREL", "WAFFLE HOUSE", "NOODLES",
            "JERSEY MIKE", "JIMMY JOHN", "FIREHOUSE SUB", "POTBELLY",
            "SWEETGREEN", "CAVA", "SHAKE SHACK", "PEET'S COFFEE",
            "TIM HORTON", "CARIBOU COFFEE", "DUTCH BROS",
            "BAKERY", "DELI", "GRILL", "BBQ", "RAMEN",
            "GRUB", "CAVIAR", "INSTACART",
            "TST*", "DAIRY QUEEN", "DOMINO'S", "DOMINOS", "BASKIN",
            "EINSTEIN BROS", "EINSTEIN BAGELS", "HOOTERS", "HAPPY LEMON",
            "CHAI N MORE", "KONA ICE", "HOT SHOTS JAVA", "SAMBAZON",
            "CURRYPOINT", "BEECHER'S", "KELLY CANNOLI", "HALAL GUYS",
            "SENOR FROG", "FOODHALL", "FOOD HALL", "CONCESSIONS",
            "DOUGH ZONE", "SULLY EATS", "LADY YUM", "CULTURES COFFEE",
            "7-ELEVEN", "MILK BAR",
            # Pacific NW / local restaurants
            "HELLO INDIA", "AADAT CUISINE", "BHINDESHI", "NOLA ",
            "RACLETTE", "ESPRESSO", "PINKABELLA", "CATERING",
            "OYSTER BAR", "SEAFOOD",
            "GOURMONDO", "ATL TODAY", "SAVANAH'S CANDY", "MARKET AT BUILDING",
            # Local businesses identified by street address (Bothell / Sammamish WA)
            "22727 BOTHELL EVERETT", "22631 NE INGLEWOOD HILL",
        ],
    },
    "groceries": {
        "name": "Groceries",
        "type": "variable",
        "keywords": [
            "GROCERY", "SAFEWAY", "KROGER", "COSTCO", "TRADER JOE",
            "WHOLE FOODS", "ALDI", "PUBLIX", "WEGMANS", "STOP & SHOP",
            "FOOD LION", "GIANT", "SHOPRITE", "MARKET BASKET", "HEB",
            "SPROUTS", "FRESH MARKET", "PIGGLY WIGGLY", "WINN DIXIE",
            "SAM'S CLUB", "BJ'S WHOLESALE", "FOOD MART", "SUPER MARKET",
            "SUPERMARKET", "FOOD DEPOT", "FOOD 4 LESS", "SAVE A LOT",
            "WINCO", "MEIJER", "FRED MEYER", "ALBERTSON", "VONS",
            "RALPHS", "HARRIS TEETER", "LIDL", "FOOD BAZAAR",
            "KEY FOOD", "C-TOWN", "FOODTOWN", "STATER BROS",
            "QFC", "PCC - ", "MAYURI", "CENTRAL MARKET",
            "MILL CREEK CNTL MKT", "MILL CREEK CENTRAL",
        ],
    },
    "transportation": {
        "name": "Transportation",
        "type": "variable",
        "keywords": [
            "GAS STATION", "CHEVRON", "SHELL", "EXXON", "MOBIL", "BP ",
            "SUNOCO", "WAWA", "UBER ", "LYFT", "PARKING", "TOLL",
            "EZ PASS", "METRO", "TRANSIT", "MTA", "AMTRAK", "AUTO REPAIR",
            "JIFFY LUBE", "MEINEKE", "CAR WASH", "FUEL", "GASOLINE",
            "VALERO", "MARATHON", "CIRCLE K", "SPEEDWAY", "QUIK TRIP",
            "SHEETZ", "CASEY'S", "PILOT", "FLYING J",
            "TIRE", "GOODYEAR", "FIRESTONE", "DISCOUNT TIRE",
            "AUTOZONE", "O'REILLY", "NAPA AUTO", "ADVANCE AUTO",
            "PENSKE", "UHAUL", "U-HAUL", "RYDER", "BUDGET TRUCK",
            "DMV", "REGISTRATION", "SMOG CHECK", "EMISSIONS",
            "UNION 76", "ARCO",
        ],
    },
    "healthcare": {
        "name": "Healthcare",
        "type": "variable",
        "keywords": [
            "PHARMACY", "CVS", "WALGREEN", "RITE AID", "DOCTOR", "HOSPITAL",
            "DENTAL", "DENTIST", "OPTOM", "VISION", "MEDICAL", "HEALTH",
            "URGENT CARE", "LABCORP", "QUEST DIAG", "CLINIC",
            "PHYSIC", "THERAPY", "DERMATOL", "CARDIOL",
            "ORTHO", "CHIRO", "HEARING", "OPTIC",
            "PRESCRIPTION", "COPAY", "DEDUCTIBLE",
        ],
    },
    "entertainment": {
        "name": "Entertainment",
        "type": "variable",
        "keywords": [
            "NETFLIX", "SPOTIFY", "HULU", "DISNEY", "HBO", "APPLE TV",
            "YOUTUBE", "PARAMOUNT", "PEACOCK", "CINEMA", "THEATER", "AMC",
            "REGAL", "TICKETMASTER", "LIVE NATION", "STUBHUB",
            "PLAYSTATION", "XBOX", "STEAM", "NINTENDO",
            "FANDANGO", "MOVIE", "CONCERT", "MUSEUM", "ZOO",
            "AQUARIUM", "AMUSEMENT", "THEME PARK", "BOWLING",
            "ARCADE", "ESCAPE ROOM", "MINI GOLF", "DAVE & BUSTER",
            "TOPGOLF", "AUDIBLE", "KINDLE", "TIDAL", "PANDORA",
            "SIRIUSXM", "CRUNCHYROLL", "FUNIMATION", "TWITCH",
            "APPLE MUSIC",
            "GOOGLE *SLING", "SLING LIVE TV", "SLING TV", "VILLAGE THEATRE",
            "RGL ", "BOUNCE BEACH", "WINTERFEST", "SHOWPASS",
            "GIGGLE GLOW", "NATL SEASH", "HARBORWALK", "PARADIES",
            "THE OVERLAKE", "OVERLAKE CLUB",
        ],
    },
    "shopping": {
        "name": "Shopping",
        "type": "variable",
        "keywords": [
            "AMAZON", "TARGET", "WALMART", "BEST BUY", "APPLE.COM",
            "APPLE STORE", "MACYS", "NORDSTROM", "TJ MAXX", "MARSHALLS",
            "ROSS", "KOHLS", "OLD NAVY", "GAP ", "NIKE", "ADIDAS",
            "ZARA", "H&M", "EBAY", "ETSY",
            "COSTCO.COM", "OVERSTOCK", "ALIEXPRESS", "SHEIN",
            "WISH.COM", "TEMU", "POSHMARK", "MERCARI",
            "DOLLAR GENERAL", "DOLLAR TREE", "FAMILY DOLLAR",
            "BIG LOTS", "FIVE BELOW", "BURLINGTON", "PRIMARK",
            "FOREVER 21", "URBAN OUTFITTER", "ANTHROPOLOGIE",
            "BANANA REPUBLIC", "J.CREW", "J CREW", "UNIQLO",
            "LULULEMON", "UNDER ARMOUR", "SKECHERS", "NEW BALANCE",
            "FOOT LOCKER", "FINISH LINE", "DICK'S SPORTING",
            "HOMEGOODS", "HOME GOODS", "DOLLARTREE", "WAL-MART",
            "HAURY", "ALVINS ISLAND",
            "BATH AND BODY WORKS", "BATH AND BODY",
            "HUDSON ST", "HUDSON NEWS", "ALTENGARTZ",
        ],
    },
    "subscriptions": {
        "name": "Subscriptions",
        "type": "fixed",
        "keywords": [
            "SUBSCRIPTION", "ANNUAL FEE", "MEMBERSHIP", "ADOBE",
            "MICROSOFT 365", "GOOGLE STORAGE", "GOOGLE ONE", "DROPBOX",
            "ICLOUD", "LINKEDIN", "GITHUB", "AWS", "DOMAIN", "HOSTING",
            "ZOOM", "SLACK", "NOTION", "FIGMA", "CANVA",
            "GRAMMARLY", "LASTPASS", "1PASSWORD", "NORDVPN",
            "EXPRESSVPN", "CHATGPT", "OPENAI", "CLAUDE",
            "HEADSPACE", "CALM APP", "PELOTON", "STRAVA",
            "RING BASIC PLAN", "RING.COM", "HP *INSTANT INK", "INSTANT INK",
            "SIMPLISAFE", "VERCEL", "MUSICCIRCLE", "WEEK JUNIOR",
            "BLOSSOMUP", "GREENLIGHT", "SAMSUNG CARE", "SAMSUNG ELECTRONICS",
        ],
    },
    "travel": {
        "name": "Travel",
        "type": "variable",
        "keywords": [
            "AIRLINE", "UNITED AIR", "DELTA AIR", "AMERICAN AIR", "SOUTHWEST",
            "JETBLUE", "SPIRIT AIR", "HOTEL", "HILTON", "MARRIOTT",
            "HYATT", "AIRBNB", "VRBO", "BOOKING.COM", "EXPEDIA",
            "KAYAK", "HOTWIRE", "PRICELINE", "HERTZ", "ENTERPRISE",
            "RENTAL CAR", "FRONTIER AIR", "ALASKA AIR", "HAWAIIAN AIR",
            "BEST WESTERN", "HOLIDAY INN", "HAMPTON INN", "LA QUINTA",
            "MOTEL", "RESORT", "WYNDHAM", "RADISSON", "CHOICE HOTEL",
            "AVIS", "BUDGET RENT", "NATIONAL CAR", "DOLLAR RENT",
            "TURO", "GETAROUND", "TRIPADVISOR", "HOSTEL",
            "TSA PRE", "GLOBAL ENTRY", "CLEAR PLUS",
        ],
    },
    "education": {
        "name": "Education",
        "type": "variable",
        "keywords": [
            "TUITION", "UNIVERSITY", "COLLEGE", "SCHOOL", "UDEMY",
            "COURSERA", "SKILLSHARE", "MASTERCLASS", "STUDENT LOAN",
            "LINKEDIN LEARNING", "PLURALSIGHT", "BRILLIANT",
            "KHAN ACADEMY", "CODECADEMY", "LEETCODE",
            "TEXTBOOK", "CHEGG", "TUTORING",
            "SCHOOL DISTRICT", "NORTHSHORE SD", "SSMA ",
        ],
    },
    "personal_care": {
        "name": "Personal Care",
        "type": "variable",
        "keywords": [
            "SALON", "BARBER", "SPA", "GYM", "FITNESS", "PLANET FITNESS",
            "EQUINOX", "CROSSFIT", "YOGA", "NAIL", "MASSAGE",
            "BEAUTY", "COSMETIC", "SEPHORA", "ULTA", "BATH & BODY",
            "HAIR", "SKIN CARE", "WAXING", "LASH", "BROW",
            "LA FITNESS", "ANYTIME FITNESS", "ORANGETHEORY", "24 HOUR FIT",
            "GOLD'S GYM", "YMCA", "YWCA",
            "HAND AND STONE", "HAND & STONE", "ZENOTIUSA", "SUPERCUTS",
            "HEALING ARTS", "VISENTA STUDIO",
        ],
    },
    "pets": {
        "name": "Pets",
        "type": "variable",
        "keywords": [
            "PET", "VET", "VETERINAR", "PETCO", "PETSMART", "CHEWY",
            "DOG ", "CAT FOOD", "ANIMAL HOSPITAL", "PET SUPPLY",
            "ROVER", "WAG ", "GROOMING",
        ],
    },
    "home": {
        "name": "Home & Garden",
        "type": "variable",
        "keywords": [
            "HOME DEPOT", "LOWES", "LOWE'S", "IKEA", "FURNITURE",
            "BED BATH", "POTTERY BARN", "CRATE & BARREL", "WAYFAIR",
            "MENARDS", "ACE HARDWARE", "TRUE VALUE", "HARBOR FREIGHT",
            "RESTORATION HARDWARE", "WEST ELM", "WILLIAMS SONOMA",
            "PIER 1", "WORLD MARKET", "AT HOME", "HOBBY LOBBY",
            "MICHAELS", "JOANN", "GARDEN", "NURSERY", "LANDSCAP",
            "PLUMBER", "ELECTRICIAN", "HVAC", "HANDYMAN",
            "CLEANING SERVICE", "MAID", "MERRY MAID",
            "TRUGREEN", "ECOSHIELD", "GREEN WORLD IRRI", "IRRIGATION",
            "FLOWER WORLD", "GET LIT LIGHTING", "PEST CONTROL", "LAWN SERVICE",
        ],
    },
    "childcare": {
        "name": "Childcare & Kids",
        "type": "variable",
        "keywords": [
            "DAYCARE", "CHILDCARE", "PRESCHOOL", "NURSERY SCHOOL",
            "BABYSIT", "NANNY", "AU PAIR", "KINDERCARE",
            "BRIGHT HORIZONS", "CHILD CARE", "KIDS ACADEMY",
            "CHILDREN'S PLACE", "GYMBOREE", "BUY BUY BABY",
            "CARTER'S", "OSHKOSH",
        ],
    },
    "donations": {
        "name": "Donations & Charity",
        "type": "variable",
        "keywords": [
            "DONATION", "CHARITY", "CHARITABLE", "NONPROFIT",
            "RED CROSS", "UNITED WAY", "SALVATION ARMY", "GOODWILL",
            "GOFUNDME", "CHURCH", "TITHE", "OFFERING",
            "SYNAGOGUE", "MOSQUE", "TEMPLE",
        ],
    },
    "fees_charges": {
        "name": "Fees & Charges",
        "type": "variable",
        "keywords": [
            "SERVICE FEE", "BANK FEE", "ATM FEE", "OVERDRAFT",
            "MONTHLY FEE", "MAINTENANCE FEE", "WIRE FEE",
            "FOREIGN TRANSACTION", "LATE FEE", "PENALTY",
            "NSF FEE", "RETURNED ITEM", "ACCOUNT FEE",
            "CONVENIENCE FEE", "PROCESSING FEE",
            "INTEREST CHARGE", "PURCHASE INTEREST", "PLAN FEE",
        ],
    },
    "cash_atm": {
        "name": "Cash & ATM",
        "type": "variable",
        "keywords": [
            "ATM WITHDRAW", "ATM WITHDRWL", "ATM W/D", "CASH WITHDRAW",
            "ATM DEBIT", "CHECK CARD ATM", "NON-CHASE ATM",
            "CASH BACK", "ATM ",
        ],
    },
    "taxes": {
        "name": "Taxes",
        "type": "fixed",
        "keywords": [
            "IRS", "INTERNAL REVENUE", "STATE TAX", "PROPERTY TAX",
            "TAX PAYMENT", "ESTIMATED TAX", "FEDERAL TAX",
            "TAX PREP", "TURBOTAX", "H&R BLOCK", "JACKSON HEWITT",
        ],
    },
    "professional": {
        "name": "Professional Services",
        "type": "variable",
        "keywords": [
            "ATTORNEY", "LAWYER", "LAW OFFICE", "LEGAL",
            "ACCOUNTANT", "CPA ", "BOOKKEEP", "TAX ADVISOR",
            "NOTARY", "FINANCIAL ADVISOR", "CONSULTANT",
            "RSM ", "BBTM*RSM",
        ],
    },
    "zelle_venmo_out": {
        "name": "Peer Payments (Out)",
        "type": "variable",
        "keywords": [
            "ZELLE PAYMENT TO", "ZELLE TO", "ZELLE SEND",
            "VENMO PAYMENT", "VENMO SEND", "VENMO DEBIT",
            "CASHAPP", "CASH APP",
            "PAYPAL PAYMENT", "PAYPAL TRANSFER", "PAYPAL INST",
        ],
    },
    "uncategorized": {
        "name": "Uncategorized",
        "type": "variable",
        "keywords": [],
    },
}


def categorize_transaction(description: str) -> tuple[str, str]:
    """Return (category_slug, category_name) for a transaction description.

    Uses keyword matching first; falls back to Claude AI if no keyword matched
    and ANTHROPIC_API_KEY is set in the environment.
    """
    desc_upper = description.upper()

    for slug, cat in EXPENSE_CATEGORIES.items():
        if slug == "uncategorized":
            continue
        for keyword in cat["keywords"]:
            if keyword in desc_upper:
                return slug, cat["name"]

    return _categorize_with_claude(description)


# Pre-build the category list string used in the Claude prompt (computed once).
_CATEGORY_PROMPT_LIST = "\n".join(
    f"{slug}: {cat['name']}"
    for slug, cat in EXPENSE_CATEGORIES.items()
    if slug != "uncategorized"
)


def _categorize_with_claude(description: str) -> tuple[str, str]:
    """Call Claude Haiku to categorize a transaction when keyword matching fails.

    Requires ANTHROPIC_API_KEY to be set; silently returns 'uncategorized' if
    the key is missing or the API call fails.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return "uncategorized", "Uncategorized"

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=32,
            messages=[{
                "role": "user",
                "content": (
                    "Categorize this bank/credit card transaction into one of the "
                    "category slugs listed below. Reply with ONLY the slug, nothing else.\n\n"
                    f"Transaction: {description}\n\n"
                    f"Slugs:\n{_CATEGORY_PROMPT_LIST}"
                ),
            }],
        )
        slug = response.content[0].text.strip().lower().strip("\"' ")
        if slug in EXPENSE_CATEGORIES and slug != "uncategorized":
            return slug, EXPENSE_CATEGORIES[slug]["name"]
    except Exception:
        pass

    return "uncategorized", "Uncategorized"


def clean_merchant_name(description: str) -> str:
    """Extract a cleaned merchant name from a transaction description.

    Strips dates, reference numbers, and common noise from the description.
    """
    # Remove leading date patterns (MM/DD, MM/DD/YY, etc.)
    cleaned = re.sub(r"^\d{1,2}/\d{1,2}(?:/\d{2,4})?\s*", "", description)
    # Remove trailing reference numbers / IDs
    cleaned = re.sub(r"\s+(?:PPD\s+)?ID:\s*\S+$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+#\d+\s*$", "", cleaned)
    cleaned = re.sub(r"\s+\d{6,}$", "", cleaned)
    # Remove trailing amounts
    cleaned = re.sub(r"\s+[\d,]+\.\d{2}\s*$", "", cleaned)
    # Trim and title-case
    cleaned = cleaned.strip()
    if cleaned:
        return cleaned.title()
    return description.strip().title()


def get_category_name(slug: str) -> str:
    """Get the display name for a category slug."""
    cat = EXPENSE_CATEGORIES.get(slug)
    return cat["name"] if cat else slug.replace("_", " ").title()
