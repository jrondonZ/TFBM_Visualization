# preprocess.py
# Cleans and aggregates cellvar.db.tfbs_seq.tsv into viz_data/tfbs_summary_top40.json
# Usage: python preprocess.py

import re, os, json, datetime, csv
from collections import defaultdict, Counter

IN_PATH = 'cellvar.db.tfbs_seq.tsv'
TOP_N = 40


def parse_token(tok: str):
    tok = tok.strip().replace('\\', '').strip(',;')
    if not tok:
        return None
    if tok[-1] in ['+', '-']:
        return tok[:-1].strip(), tok[-1]
    return tok.strip(), '0'  # unknown sign


def main():
    rows = []
    with open(IN_PATH, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.rstrip('')
            if not line.strip():
                continue
            parts = line.split('	')
            if len(parts) < 2:
                parts = re.split(r'\s+', line.strip())
            if len(parts) < 2:
                continue
            cell_type = parts[0].strip()
            tissue = parts[1].strip()
            tokens = [p.strip() for p in parts[2:] if p.strip()]
            rows.append((cell_type, tissue, tokens))

    stats = defaultdict(lambda: {'+':0,'-':0,'0':0,'total':0})
    tissue_totals = Counter()
    tf_totals = Counter()

    for cell_type, tissue, tokens in rows:
        tissue_totals[tissue] += 1
        for tok in tokens:
            parsed = parse_token(tok)
            if parsed is None:
                continue
            tf, sign = parsed
            tf = re.sub(r'\s+', '', tf)
            key = (tissue, tf)
            stats[key][sign] += 1
            stats[key]['total'] += 1
            tf_totals[tf] += 1

    tissues = [t for t,_ in tissue_totals.most_common()]
    top_tfs = [tf for tf,_ in tf_totals.most_common(TOP_N)]

    matrix = []
    max_total = 0
    for tissue in tissues:
        for tf in top_tfs:
            s = stats.get((tissue, tf), {'+':0,'-':0,'0':0,'total':0})
            total = s['total']
            score = (s['+'] - s['-'])/total if total else 0
            matrix.append({
                'tissue': tissue,
                'tf': tf,
                'plus': s['+'],
                'minus': s['-'],
                'unknown': s['0'],
                'total': total,
                'score': score,
                'imputed': total == 0
            })
            max_total = max(max_total, total)

    per_tissue = []
    for tissue in tissues:
        plus = sum(stats.get((tissue, tf), {'+':0})['+'] for tf in top_tfs)
        minus = sum(stats.get((tissue, tf), {'-':0})['-'] for tf in top_tfs)
        unk = sum(stats.get((tissue, tf), {'0':0})['0'] for tf in top_tfs)
        per_tissue.append({'tissue': tissue, 'plus': plus, 'minus': minus, 'unknown': unk, 'total': plus+minus+unk})

    per_tf = []
    for tf in top_tfs:
        plus = sum(stats.get((tissue, tf), {'+':0})['+'] for tissue in tissues)
        minus = sum(stats.get((tissue, tf), {'-':0})['-'] for tissue in tissues)
        unk = sum(stats.get((tissue, tf), {'0':0})['0'] for tissue in tissues)
        total = plus+minus+unk
        score = (plus-minus)/total if total else 0
        per_tf.append({'tf': tf, 'plus': plus, 'minus': minus, 'unknown': unk, 'total': total, 'score': score})

    meta = {
        'title': 'TFBS Signatures across Tissues (CellVar TFBS Sequence DB)',
        'source_file': IN_PATH,
        'created': datetime.date.today().isoformat(),
        'notes': [
            'Parsed each row as: cell_type, tissue, followed by a variable-length list of TF tokens.',
            'Each TF token ends with + or - indicating direction; tokens without a sign are labeled unknown (0).',
            'Aggregated counts per (tissue, TF) without removing outliers.',
            'Matrix cells with total=0 are treated as structural zeros and flagged as imputed.'
        ],
        'axes_units': {
            'heatmap_color': 'Signed proportion (plus-minus)/total (unitless, range [-1,1])',
            'heatmap_size': 'Count of occurrences (records)',
            'bars': 'Count of occurrences (records)'
        }
    }

    out_dir = 'viz_data'
    os.makedirs(out_dir, exist_ok=True)

    out_json = {
        'meta': meta,
        'tissues': tissues,
        'tfs': top_tfs,
        'matrix': matrix,
        'per_tissue': per_tissue,
        'per_tf': per_tf,
        'max_total': max_total
    }

    json_path = os.path.join(out_dir, 'tfbs_summary_top40.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(out_json, f, ensure_ascii=False)

    csv_path = os.path.join(out_dir, 'tfbs_summary_top40.csv')
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['tissue','tf','plus','minus','unknown','total','score','imputed'])
        for m in matrix:
            w.writerow([m[k] for k in ['tissue','tf','plus','minus','unknown','total','score','imputed']])

    print('Wrote:', json_path)
    print('Wrote:', csv_path)


if __name__ == '__main__':
    main()
