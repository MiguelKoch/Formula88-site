#!/usr/bin/env python3
"""Fórmula 88: "volta 0" de cada kart, sem afinações à mão.

A folha de tempos dá o tempo de cada volta e a diferença final para o vencedor, mas não diz
quando é que cada kart cruzou a meta pela primeira vez (a partida é lançada, em fila). Essa
"volta 0" tira-se da própria folha:

    diferença oficial = (volta 0 + soma das voltas) - (volta 0 do vencedor + soma das voltas dele)

Para os pilotos com volta(s) de atraso a folha só dá a diferença dentro do grupo deles, por isso
falta uma incógnita por grupo. É estimada assumindo que os karts cruzam a meta em fila, com
intervalos regulares: escolhe-se o valor que deixa a fila mais regular. É uma estimativa.

Entrada: CSV pela ordem da classificação, com as colunas
    Piloto, 1, 2, 3, ..., Dif
  - voltas em segundos (59.135) ou m:ss.mmm (1:02.656); vazio = volta não feita
  - Dif: vazio ou 0 no vencedor; segundos ou m:ss.mmm; "1 Volta" no primeiro de cada grupo atrasado
  - outras colunas (Kart, Média, ...) são ignoradas

Uso:
    python3 tools/lap0.py tools/raw/2027-viana.csv
    python3 tools/lap0.py tools/raw/2027-viana.csv --replay data/2027/replays/viana.json
        (atualiza "start" e "laps" de cada piloto nesse ficheiro; a pista fica como está)
"""
import argparse, csv, json, re, sys


def secs(v):
    v = (v or '').strip().replace(',', '.')
    if not v:
        return None
    if ':' in v:
        m, s = v.split(':')
        return int(m) * 60 + float(s)
    return float(v)


def read(path):
    rows = []
    with open(path, newline='', encoding='utf-8-sig') as f:
        r = csv.DictReader(f)
        lap_cols = sorted((c for c in r.fieldnames if c.strip().isdigit()), key=lambda c: int(c))
        dif_col = next((c for c in r.fieldnames if c.strip().lower() in ('dif', 'diferença', 'diferenca')), None)
        name_col = next(c for c in r.fieldnames if c.strip().lower() in ('piloto', 'nome', 'name'))
        if not lap_cols or dif_col is None:
            sys.exit('O CSV precisa de colunas de voltas (1, 2, 3, ...) e de uma coluna Dif.')
        for row in r:
            laps = []
            for c in lap_cols:
                t = secs(row[c])
                if t is None:
                    break
                laps.append(round(t, 3))
            if not laps:
                continue
            raw = (row[dif_col] or '').strip()
            lapped = bool(re.search(r'volta|lap', raw, re.I))
            rows.append({'name': row[name_col].strip(), 'laps': laps, 'sum': sum(laps),
                         'dif': None if lapped else (secs(raw) or 0.0), 'lapped': lapped})
    return rows


def regularity(offsets):
    """Soma dos quadrados dos desvios a uma fila com intervalos iguais (reta de mínimos quadrados)."""
    ys = sorted(offsets); n = len(ys)
    if n < 3:
        return 0.0
    mx = (n - 1) / 2; my = sum(ys) / n
    sxx = sum((i - mx) ** 2 for i in range(n))
    b = sum((i - mx) * (y - my) for i, y in enumerate(ys)) / sxx
    return sum((y - (my + b * (i - mx))) ** 2 for i, y in enumerate(ys))


def solve(rows):
    # grupos = pilotos seguidos com o mesmo número de voltas; a diferença é relativa ao primeiro do grupo
    groups = []
    for r in rows:
        if not groups or len(r['laps']) != len(groups[-1][0]['laps']) or r['lapped']:
            groups.append([])
        groups[-1].append(r)
    for g in groups:
        lead = g[0]
        for r in g:
            r['rel'] = 0.0 if r is lead else r['dif'] - (r['sum'] - lead['sum'])
    known = [r['rel'] for r in groups[0]]
    for r in groups[0]:
        r['start'] = r['rel']; r['estimated'] = False
    for g in groups[1:]:
        lo, hi = min(known), max(known)
        gap = (hi - lo) / max(len(known) - 1, 1) or 0.3
        span = max(r['rel'] for r in g) - min(r['rel'] for r in g)
        best = None; steps = int(round((hi - lo + span + 6 * gap) / 0.005))
        for k in range(steps + 1):
            h = lo - span - 3 * gap + k * 0.005
            cost = regularity(known + [h + r['rel'] for r in g]) - 1e-9 * h   # empate: mais atrás na fila
            if best is None or cost < best[0]:
                best = (cost, h)
        for r in g:
            r['start'] = best[1] + r['rel']; r['estimated'] = True
        known += [r['start'] for r in g]
    base = min(r['start'] for r in rows)
    for r in rows:
        r['start'] = round(r['start'] - base, 3)
    return rows


def main():
    ap = argparse.ArgumentParser(description='Calcula a "volta 0" de cada kart a partir da folha de tempos.')
    ap.add_argument('csv'); ap.add_argument('--replay', help='ficheiro de replay a atualizar (start e laps)')
    a = ap.parse_args()
    rows = solve(read(a.csv))
    print(f"{'Piloto':<22}{'voltas':>7}{'volta 0':>9}{'meta final':>12}")
    for r in rows:
        print(f"{r['name']:<22}{len(r['laps']):>7}{r['start']:>9.3f}{r['start'] + r['sum']:>12.3f}" + ('   (estimada)' if r['estimated'] else ''))
    order = sorted(rows, key=lambda r: r['start'])
    print('\nOrdem na primeira passagem pela meta: ' + ', '.join(r['name'] for r in order))
    if a.replay:
        data = json.load(open(a.replay, encoding='utf-8'))
        by = {d['name'].lower(): d for d in data.get('drivers', [])}
        out = []
        for r in rows:
            d = by.get(r['name'].lower(), {'name': r['name']})
            d['start'] = r['start']; d['laps'] = r['laps']; out.append(d)
        data['drivers'] = out
        json.dump(data, open(a.replay, 'w', encoding='utf-8'), ensure_ascii=False)
        print('\nAtualizado: ' + a.replay)


if __name__ == '__main__':
    main()
