"""
Raider och bossar till assignment-tavlan: data/raids.json + bossporträtt i assets/bosses/.

  python scripts/fetch_bosses.py

Porträtten är spelets egna (Encounter Journal, interface/encounterjournal/ui-ej-boss-<namn>.blp).
Finns de redan i wowguild-projektet kopieras de därifrån, annars hämtas de ur spelfilerna med
wowguilds CASC-läsare (C:\\JOBB\\wowguild\\scripts\\casc.py). Raidernas innehåll står i RAIDS nedan.
"""
import json
import re
import shutil
import sys
from pathlib import Path

WOWGUILD = Path(r"C:\JOBB\wowguild")
sys.path.insert(0, str(WOWGUILD / "scripts"))

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "bosses"

# (id, namn, storlek, bossar). Onyxia har en boss i tre faser: kolumnerna är faserna, bilden densamma.
RAIDS = [
    ("mc", "Molten Core", 40, ["Lucifron", "Magmadar", "Gehennas", "Garr", "Shazzrah", "Baron Geddon",
                              "Golemagg the Incinerator", "Sulfuron Harbinger", "Majordomo Executus", "Ragnaros"]),
    ("ony", "Onyxia's Lair", 40, [("Fas 1", "Onyxia"), ("Fas 2", "Onyxia"), ("Fas 3", "Onyxia")]),
    ("bwl", "Blackwing Lair", 40, ["Razorgore the Untamed", "Vaelastrasz the Corrupt", "Broodlord Lashlayer", "Firemaw",
                                  "Ebonroc", "Flamegor", "Chromaggus", "Nefarian"]),
    ("zg", "Zul'Gurub", 20, ["High Priestess Jeklik", "High Priest Venoxis", "High Priestess Mar'li", "Bloodlord Mandokir",
                            "Edge of Madness", "Gahz'ranka", "High Priest Thekal", "High Priestess Arlokk",
                            ("Jin'do the Hexxer", "Jindo the Godbreaker"), ("Hakkar", "Avatar of Hakkar")]),
    ("aq20", "Ruins of Ahn'Qiraj", 20, ["Kurinnaxx", "General Rajaxx", "Moam", "Buru the Gorger", "Ayamiss the Hunter",
                                       "Ossirian the Unscarred"]),
    ("aq40", "Temple of Ahn'Qiraj", 40, ["The Prophet Skeram", ("Bug Trio", "Silithid Royalty"), "Battleguard Sartura",
                                        "Fankriss the Unyielding", "Viscidus", "Princess Huhuran",
                                        ("Twin Emperors", "Twin Emperors"), "Ouro", "C'Thun"]),
    ("naxx", "Naxxramas", 40, ["Anub'Rekhan", "Grand Widow Faerlina", "Maexxna", "Noth the Plaguebringer",
                              "Heigan the Unclean", "Loatheb", "Instructor Razuvious", "Gothik the Harvester",
                              ("The Four Horsemen", "Four Horseman"), "Patchwerk", "Grobbulus", "Gluth", "Thaddius",
                              "Sapphiron", "Kel'Thuzad"]),
    ("ubrs", "Upper Blackrock Spire", 10, ["Pyroguard Emberseer", "Warchief Rend Blackhand", "The Beast",
                                           "General Drakkisath"]),
]
TITLES = ("high priestess ", "high priest ", "bloodlord ", "battleguard ", "princess ", "general ", "instructor ",
          "grand widow ", "warchief ", "pyroguard ", "the prophet ", "the ")

slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())


def variants(name):
    n = name.lower()
    out = [n]
    for t in TITLES:
        if n.startswith(t):
            out.append(n[len(t):])
    for v in list(out):
        out.append(v.split(" the ")[0])   # "golemagg the incinerator" → "golemagg"
    return [norm(v) for v in out]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ej = {}
    with open(WOWGUILD / ".cache" / "listfile.csv", encoding="utf-8") as f:
        for line in f:
            fid, _, path = line.rstrip("\n").partition(";")
            m = re.match(r"interface/encounterjournal/ui-ej-boss-(.+)\.blp$", path.lower())
            if m:
                ej.setdefault(norm(m.group(1)), int(fid))
    casc = None
    raids, missing = [], []
    for rid, name, size, bosses in RAIDS:
        cols = [{"name": "Trash", "image": None}]
        for b in bosses:
            label, art = b if isinstance(b, tuple) else (b, b)
            dest = OUT / f"{slug(art)}.webp"
            if not dest.exists():
                have = WOWGUILD / "assets" / "art" / f"boss-{slug(art)}.webp"
                if have.exists():
                    shutil.copy(have, dest)
                else:
                    fid = next((ej[v] for v in variants(art) if v in ej), None)
                    if fid:
                        if casc is None:
                            from casc import Casc
                            casc = Casc()
                        from fetch_assets import decode_blp
                        decode_blp(casc.get(fid)).save(dest, "WEBP", quality=90, method=6, exact=True)
            if dest.exists():
                cols.append({"name": label, "image": f"assets/bosses/{dest.name}"})
            else:
                cols.append({"name": label, "image": None})
                missing.append(art)
        raids.append({"id": rid, "name": name, "size": size, "columns": cols})
    (ROOT / "data" / "raids.json").write_text(json.dumps(raids, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(raids)} raider, {sum(len(r['columns']) - 1 for r in raids)} bossar")
    print("utan porträtt:", ", ".join(missing) or "inga")


if __name__ == "__main__":
    main()
