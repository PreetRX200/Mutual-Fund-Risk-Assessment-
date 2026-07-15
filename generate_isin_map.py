import pandas as pd
import requests

def main():
    print("Downloading AMFI NAV file...")
    url = "https://www.amfiindia.com/spages/NAVAll.txt"
    r = requests.get(url)
    lines = r.text.splitlines()
    
    mapping = {}
    for line in lines:
        parts = line.split(';')
        if len(parts) >= 2:
            code = parts[0].strip()
            isin = parts[1].strip()
            if code.isdigit() and isin.startswith("INF"):
                mapping[int(code)] = isin
                
    print("Loading dataset...")
    df = pd.read_csv('mutual_fund_dataset_cleaned.csv')
    unique_codes = df['Scheme Code'].dropna().unique().tolist()
    
    results = []
    for code in unique_codes:
        if code in mapping:
            results.append({'Scheme Code': code, 'ISIN': mapping[code]})
        else:
            results.append({'Scheme Code': code, 'ISIN': None})
            
    mapped_df = pd.DataFrame(results)
    out_file = 'scheme_to_isin.csv'
    mapped_df.to_csv(out_file, index=False)
    print(f"Saved {len(mapped_df)} mappings to {out_file}. ISINs found: {mapped_df['ISIN'].notna().sum()}")

if __name__ == "__main__":
    main()
