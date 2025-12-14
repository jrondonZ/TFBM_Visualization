# TFBS Tissue Signatures (D3)

## Files
- `cellvar.db.tfbs_seq.tsv` — input dataset
- `preprocess.py` — Python cleaning + aggregation
- `tfbs_summary_top40.json` — cleaned data for D3
- `index.html`, `styles.css`, `app.js` — visualization

## Run
1) (Optional) regenerate the cleaned data:
```bash
python preprocess.py
```
2) Serve the folder with a local web server (required because browsers block `fetch()` from the filesystem):
```bash
python -m http.server 8000
```
3) Open: http://localhost:8000/index.html

## Interactions
- Hover a heatmap cell: tooltip + infobox + mini bar chart.
- Click a cell: pin selection + update stacked bar chart.
