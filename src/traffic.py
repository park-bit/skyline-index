import glob
import os
import pandas as pd

from src.config import RAW


def parse_faa_enplanements(airports):
    iata_set = set(airports["iata"])
    local_map = airports.dropna(subset=["local_code"]).set_index("local_code")["iata"].to_dict()

    records = []
    for filepath in sorted(glob.glob(str(RAW / "faa" / "*"))):
        base = os.path.basename(filepath)
        year_str = base.split("_")[0].replace("cy", "")
        if not year_str.isdigit():
            continue
        year = int(year_str)

        # 2014 file places data in the second tab.
        sheet = "ChangeinRevenuePassengerEnplan " if "cy2014" in base else 0
        try:
            raw = pd.read_excel(filepath, sheet_name=sheet, header=None)
        except Exception:
            continue

        header_idx = None
        for i, row in raw.iloc[:10].iterrows():
            if any("locid" in str(v).lower() for v in row):
                header_idx = i
                break
        if header_idx is None:
            continue

        raw.columns = [str(c).strip() for c in raw.iloc[header_idx]]
        df = raw.iloc[header_idx + 1:].copy()

        loc_cols = [c for c in df.columns if "loc" in c.lower()]
        if not loc_cols:
            continue
        loc_col = loc_cols[0]

        yr_short = str(year)[-2:]
        target_col = None
        for col in df.columns:
            cl = col.lower()
            if (str(year) in cl or yr_short in cl) and any(w in cl for w in ["enplanement", "boarding", "total"]):
                target_col = col
                break
        if not target_col:
            fallback = [c for c in df.columns if any(w in c.lower() for w in ["enplanement", "boarding", "total"])]
            if not fallback:
                continue
            target_col = fallback[0]

        for _, row in df.iterrows():
            raw_id = str(row[loc_col]).strip().upper()
            iata = raw_id if raw_id in iata_set else local_map.get(raw_id)
            if not iata:
                continue
            val = pd.to_numeric(row[target_col], errors="coerce")
            if pd.notna(val) and val >= 0:
                records.append({"iata": iata, "year": year, "faa_enplanements": float(val)})

    res = pd.DataFrame(records).drop_duplicates(subset=["iata", "year"])
    return res.sort_values(["iata", "year"]).reset_index(drop=True)


def parse_eurostat_passengers(airports, icao_map):
    tsv_path = RAW / "eurostat" / "avia_paoa.tsv.gz"
    if not tsv_path.exists():
        return pd.DataFrame(columns=["iata", "year", "eurostat_passengers"])

    raw = pd.read_csv(tsv_path, sep="\t")
    key = raw.columns[0]
    meta_cols = [c.strip() for c in key.split("\\")[0].split(",")]
    meta = raw[key].str.split(",", expand=True)
    meta.columns = meta_cols
    data = pd.concat([meta, raw.drop(columns=[key])], axis=1)

    subset = data[(data["tra_meas"] == "PAS_CRD") & (data["tra_cov"] == "TOTAL") & (data["schedule"] == "TOTAL")]
    year_cols = [c for c in subset.columns if c.strip().isdigit()]

    records = []
    for _, row in subset.iterrows():
        rep = str(row["rep_airp"]).strip()
        icao = rep.split("_")[1] if "_" in rep else rep
        iata = icao_map.get(icao)
        if not iata:
            continue
        for y_col in year_cols:
            year = int(y_col.strip())
            val_str = str(row[y_col]).strip().split()[0].replace(":", "")
            try:
                val = float(val_str)
                if val >= 0:
                    records.append({"iata": iata, "year": year, "eurostat_passengers": val})
            except ValueError:
                continue

    res = pd.DataFrame(records).drop_duplicates(subset=["iata", "year"])
    return res.sort_values(["iata", "year"]).reset_index(drop=True)
