#!/usr/bin/env python3
import argparse
import colorsys
import json
import math
import struct
import zlib
from pathlib import Path

COMPONENT_INDEX = {
    'px': 3,
    'py': 4,
    'pz': 5,
}

ARROW_LENGTH_FACTOR = 0.75
ARROW_OUTLINE_THICKNESS = 4
ARROW_INNER_THICKNESS = 2
ARROW_HEAD_MIN = 5.0
ARROW_HEAD_MAX = 13.0
ARROW_HEAD_FACTOR = 0.42

VARIANT_111_DIRECTIONS = [
    (1.0, 1.0, 1.0),
    (1.0, -1.0, 1.0),
    (-1.0, 1.0, 1.0),
    (-1.0, -1.0, 1.0),
    (1.0, 1.0, -1.0),
    (1.0, -1.0, -1.0),
    (-1.0, 1.0, -1.0),
    (-1.0, -1.0, -1.0),
]
VARIANT_111_LABELS = ['[1,1,1]', '[1,-1,1]', '[-1,1,1]', '[-1,-1,1]', '[1,1,-1]', '[1,-1,-1]', '[-1,1,-1]', '[-1,-1,-1]']
VARIANT_111_COLORS_HEX = ['#D55E00', '#E69F00', '#F0E442', '#CC79A7', '#0072B2', '#009E73', '#56B4E9', '#6A3D9A']
VARIANT_111_INVALID_HEX = '#BDBDBD'
VARIANT_111_COLORS = [tuple(int(color[i:i + 2], 16) for i in (1, 3, 5)) for color in VARIANT_111_COLORS_HEX]
VARIANT_111_INVALID_COLOR = tuple(int(VARIANT_111_INVALID_HEX[i:i + 2], 16) for i in (1, 3, 5))
VARIANT_111_NORMALIZED = [(x / math.sqrt(3.0), y / math.sqrt(3.0), z / math.sqrt(3.0)) for x, y, z in VARIANT_111_DIRECTIONS]


def main():
    parser = argparse.ArgumentParser(description='Visualize PFM2 Polar.*.dat files')
    parser.add_argument('case_dir', type=Path)
    parser.add_argument('--mode', default='component', choices=['component', 'inplane_angle', 'angle_arrow', 'inplane_angle_arrow', 'variant_111', 'variant_111_arrow'])
    parser.add_argument('--component', default='pz', choices=['px', 'py', 'pz', 'magnitude'])
    parser.add_argument('--slice', default='xz', choices=['xz'])
    parser.add_argument('--steps', default='all')
    parser.add_argument('--output-policy', default='selected_only', choices=['selected_only', 'all_modes'])
    args = parser.parse_args()
    mode = 'inplane_angle_arrow' if args.mode == 'angle_arrow' else args.mode

    case_dir = args.case_dir.resolve()
    figures_dir = case_dir / 'figures'
    figures_dir.mkdir(parents=True, exist_ok=True)

    files = select_files(case_dir, args.steps)
    if not files:
        raise SystemExit('No Polar.*******.dat files found')

    warnings = set()
    for polar_file in files:
        for warning in render_file(polar_file, figures_dir, args.component, mode, args.output_policy):
            warnings.add(warning)
    if args.output_policy == 'all_modes' or mode in ('inplane_angle', 'inplane_angle_arrow'):
        (figures_dir / 'polar_angle_legend.png').write_bytes(render_angle_color_wheel_legend())
    if args.output_policy == 'all_modes' or mode in ('variant_111', 'variant_111_arrow'):
        (figures_dir / 'polar_variant_111_legend.png').write_bytes(render_variant_111_legend())
    if warnings:
        (figures_dir / 'ferro_visualization_warnings.json').write_text(json.dumps(sorted(warnings), ensure_ascii=False, indent=2))


def select_files(case_dir, steps):
    files = sorted(case_dir.glob('Polar.[0-9][0-9][0-9][0-9][0-9][0-9][0-9].dat'))
    if steps == 'all':
        return files
    wanted = {int(part.strip()) for part in str(steps).split(',') if part.strip()}
    return [item for item in files if int(item.stem.split('.')[1]) in wanted]


def render_file(path, figures_dir, component, mode, output_policy='selected_only'):
    rows, metadata = read_rows(path)
    if not rows:
        raise ValueError(f'{path.name} is empty')
    fields = build_fields(rows)
    if metadata.get('missing_py'):
        fields['missingComponents'] = ['py']
    modes = ['component', 'inplane_angle', 'inplane_angle_arrow', 'variant_111', 'variant_111_arrow'] if output_policy == 'all_modes' else [mode]
    warnings = []
    if any(item in ('variant_111', 'variant_111_arrow') for item in modes) and 'py' in fields.get('missingComponents', []):
        warnings.append('当前数据缺少 Py，无法完整区分 R-BFO 八个 <111> 变体，只能显示投影分类。')
    for item in modes:
        if item == 'component':
            png = render_component_arrow_overlay(fields, component, detect_inplane_components(fields))
            (figures_dir / f'{path.stem}_{component}.png').write_bytes(png)
        elif item == 'inplane_angle':
            components = detect_inplane_components(fields)
            angle_png = render_inplane_angle_map(fields, components)
            (figures_dir / f'{path.stem}_inplane_angle.png').write_bytes(angle_png)
        elif item == 'inplane_angle_arrow':
            components = detect_inplane_components(fields)
            arrow_png = render_angle_arrow_overlay(fields, components)
            (figures_dir / f'{path.stem}_inplane_angle_arrow.png').write_bytes(arrow_png)
        elif item == 'variant_111':
            variant_png = render_variant_111_map(fields)
            (figures_dir / f'{path.stem}_variant_111.png').write_bytes(variant_png)
        elif item == 'variant_111_arrow':
            components = detect_inplane_components(fields)
            variant_arrow_png = render_variant_111_arrow_overlay(fields, components)
            (figures_dir / f'{path.stem}_variant_111_arrow.png').write_bytes(variant_arrow_png)
    return warnings


def read_rows(path):
    rows = []
    metadata = { 'missing_py': False }
    for line in path.read_text().splitlines():
        parts = line.split()
        if len(parts) >= 6:
            rows.append((int(parts[0]), int(parts[1]), int(parts[2]), float(parts[3]), float(parts[4]), float(parts[5])))
            continue
        if len(parts) == 5:
            metadata['missing_py'] = True
            rows.append((int(parts[0]), int(parts[1]), int(parts[2]), float(parts[3]), math.nan, float(parts[4])))
            continue
    return rows, metadata


def build_fields(rows):
    nx = max(row[0] for row in rows)
    ny = max(row[1] for row in rows)
    nz = max(row[2] for row in rows)
    fields = {
        'nx': nx,
        'ny': ny,
        'nz': nz,
        'px': [[math.nan for _ in range(nx)] for _ in range(nz)],
        'py': [[math.nan for _ in range(nx)] for _ in range(nz)],
        'pz': [[math.nan for _ in range(nx)] for _ in range(nz)],
    }
    for i, _j, k, px, py, pz in rows:
        fields['px'][k - 1][i - 1] = px
        fields['py'][k - 1][i - 1] = py
        fields['pz'][k - 1][i - 1] = pz
    return fields


def detect_inplane_components(fields, plane='auto', existing_visualization_context=None):
    if fields.get('ny') == 1:
        return ('px', 'pz')
    if fields.get('nz') == 1:
        return ('px', 'py')
    if fields.get('nx') == 1:
        return ('py', 'pz')
    return ('px', 'py')


def component_values(fields, component):
    if component in COMPONENT_INDEX:
        return fields[component]
    nx = fields['nx']
    nz = fields['nz']
    values = [[math.nan for _ in range(nx)] for _ in range(nz)]
    for z in range(nz):
        for x in range(nx):
            px = fields['px'][z][x]
            py = fields['py'][z][x]
            pz = fields['pz'][z][x]
            if all(math.isfinite(v) for v in (px, py, pz)):
                values[z][x] = math.sqrt(px * px + py * py + pz * pz)
    return values


def finite(values):
    items = [value for row in values for value in row if math.isfinite(value)]
    return items or [0.0]


def percentile(values, pct):
    items = sorted(value for value in values if math.isfinite(value))
    if not items:
        return 1.0
    index = min(len(items) - 1, max(0, int(round((pct / 100.0) * (len(items) - 1)))))
    return items[index] or 1.0


def compute_inplane_angle(pa, pb):
    return math.atan2(pb, pa)


def inplane_angle_arrays(fields, components):
    a, b = components
    nx = fields['nx']
    nz = fields['nz']
    theta = [[math.nan for _ in range(nx)] for _ in range(nz)]
    mag = [[math.nan for _ in range(nx)] for _ in range(nz)]
    for z in range(nz):
        for x in range(nx):
            pa = fields[a][z][x]
            pb = fields[b][z][x]
            if math.isfinite(pa) and math.isfinite(pb):
                theta[z][x] = compute_inplane_angle(pa, pb)
                mag[z][x] = math.sqrt(pa * pa + pb * pb)
    return theta, mag


def render_inplane_angle_map(fields, components, scale=6):
    theta, mag = inplane_angle_arrays(fields, components)
    width, height, pixels = angle_pixels(theta, mag, scale)
    return write_rgb_png(width, height, pixels)


def render_angle_arrow_overlay(fields, components, scale=6):
    theta, mag = inplane_angle_arrays(fields, components)
    width, height, pixels = angle_pixels(theta, mag, scale)
    nx = fields['nx']
    nz = fields['nz']
    stride = max(1, math.ceil(max(nx, nz) / 18))
    threshold = percentile(finite(mag), 95)
    arrow_length = max(5.0, scale * stride * ARROW_LENGTH_FACTOR)
    for z in range(stride // 2, nz, stride):
        for x in range(stride // 2, nx, stride):
            angle = theta[z][x]
            strength = mag[z][x]
            if not math.isfinite(angle) or not math.isfinite(strength) or strength <= 1e-12:
                continue
            frac = max(0.25, min(1.0, strength / threshold)) if threshold > 0 else 1.0
            cx = int(round((x + 0.5) * scale))
            cy = int(round((nz - z - 0.5) * scale))
            dx = math.cos(angle)
            dy = -math.sin(angle)
            ex = cx + dx * arrow_length * frac
            ey = cy + dy * arrow_length * frac
            draw_arrow(pixels, width, height, cx, cy, ex, ey)
    return write_rgb_png(width, height, pixels)


def render_component_arrow_overlay(fields, component, components, scale=6):
    values = component_values(fields, component)
    finite_values = finite(values)
    vmax = max(abs(min(finite_values)), abs(max(finite_values)), 1e-12)
    width, height, pixels = heatmap_pixels(values, -vmax, vmax, scale)
    nx = fields['nx']
    nz = fields['nz']
    comp_a, comp_b = components
    stride = max(1, math.ceil(max(nx, nz) / 18))
    arrow_length = max(5.0, scale * stride * ARROW_LENGTH_FACTOR)
    magnitudes = []
    for z in range(nz):
        for x in range(nx):
            pa = fields[comp_a][z][x]
            pb = fields[comp_b][z][x]
            if math.isfinite(pa) and math.isfinite(pb):
                magnitudes.append(math.sqrt(pa * pa + pb * pb))
    threshold = percentile(magnitudes, 95)
    for z in range(stride // 2, nz, stride):
        for x in range(stride // 2, nx, stride):
            pa = fields[comp_a][z][x]
            pb = fields[comp_b][z][x]
            norm = math.sqrt(pa * pa + pb * pb) if math.isfinite(pa) and math.isfinite(pb) else 0.0
            if norm <= 1e-12:
                continue
            frac = max(0.25, min(1.0, norm / threshold)) if threshold > 0 else 1.0
            cx = int(round((x + 0.5) * scale))
            cy = int(round((nz - z - 0.5) * scale))
            dx = pa / norm
            dy = -pb / norm
            ex = cx + dx * arrow_length * frac
            ey = cy + dy * arrow_length * frac
            draw_arrow(pixels, width, height, cx, cy, ex, ey)
    return write_rgb_png(width, height, pixels)


def angle_pixels(theta, mag, scale=6):
    height = len(theta)
    width = len(theta[0]) if height else 0
    out_w = max(1, width * scale)
    out_h = max(1, height * scale)
    pixels = bytearray(out_w * out_h * 3)
    mag95 = percentile(finite(mag), 95)
    for y in range(out_h):
        src_y = height - 1 - min(height - 1, y // scale)
        for x in range(out_w):
            src_x = min(width - 1, x // scale)
            color = angle_color(theta[src_y][src_x], mag[src_y][src_x], mag95)
            set_pixel(pixels, out_w, out_h, x, y, color)
    return out_w, out_h, pixels


def angle_color(theta, magnitude, mag95):
    if not math.isfinite(theta):
        return (230, 230, 230)
    hue = (theta + math.pi) / (2 * math.pi)
    value = 1.0
    if math.isfinite(magnitude) and mag95 > 0:
        value = max(0.2, min(1.0, magnitude / mag95))
    r, g, b = colorsys.hsv_to_rgb(hue % 1.0, 1.0, value)
    return (int(r * 255), int(g * 255), int(b * 255))


def render_angle_color_wheel_legend(size=180):
    pixels = bytearray(size * size * 3)
    cx = cy = size / 2
    radius = size * 0.42
    for y in range(size):
        for x in range(size):
            dx = x + 0.5 - cx
            dy = cy - (y + 0.5)
            r = math.sqrt(dx * dx + dy * dy)
            if r > radius:
                color = (250, 250, 250)
            else:
                theta = math.atan2(dy, dx)
                color = angle_color(theta, 1.0, 1.0)
            set_pixel(pixels, size, size, x, y, color)
    # axis ticks: 0, 90, 180, 270 degrees
    for angle in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        x = int(round(cx + math.cos(angle) * radius))
        y = int(round(cy - math.sin(angle) * radius))
        draw_point(pixels, size, size, x, y, (20, 20, 20), 5)
    return write_rgb_png(size, size, pixels)


def nearest_variant_111(px, py, pz, p_min, confidence_min=0.65):
    if not math.isfinite(px) or not math.isfinite(pz):
        return -1, 0.0
    if not math.isfinite(py):
        py = 0.0
    mag = math.sqrt(px * px + py * py + pz * pz)
    if mag < p_min:
        return -1, 0.0
    nx = px / (mag + 1e-12)
    ny = py / (mag + 1e-12)
    nz = pz / (mag + 1e-12)
    best_id = -1
    best_score = -2.0
    for idx, variant in enumerate(VARIANT_111_NORMALIZED):
        score = nx * variant[0] + ny * variant[1] + nz * variant[2]
        if score > best_score:
            best_id = idx
            best_score = score
    if best_score < confidence_min:
        return -1, best_score
    return best_id, best_score


def variant_111_arrays(fields, confidence_min=0.65):
    nx = fields['nx']
    nz = fields['nz']
    magnitudes = []
    for z in range(nz):
        for x in range(nx):
            px = fields['px'][z][x]
            py = fields['py'][z][x]
            pz = fields['pz'][z][x]
            if math.isfinite(px) and math.isfinite(pz):
                if not math.isfinite(py):
                    py = 0.0
                magnitudes.append(math.sqrt(px * px + py * py + pz * pz))
    p_min = max(1e-6, 0.05 * percentile(magnitudes, 95))
    variant_id = [[-1 for _ in range(nx)] for _ in range(nz)]
    confidence = [[0.0 for _ in range(nx)] for _ in range(nz)]
    for z in range(nz):
        for x in range(nx):
            px = fields['px'][z][x]
            py = fields['py'][z][x]
            pz = fields['pz'][z][x]
            variant_id[z][x], confidence[z][x] = nearest_variant_111(px, py, pz, p_min, confidence_min=confidence_min)
    return variant_id, confidence


def render_variant_111_map(fields, scale=6):
    variant_id, _confidence = variant_111_arrays(fields)
    width, height, pixels = variant_111_pixels(variant_id, scale)
    return write_rgb_png(width, height, pixels)


def render_variant_111_arrow_overlay(fields, components, scale=6):
    variant_id, _confidence = variant_111_arrays(fields)
    width, height, pixels = variant_111_pixels(variant_id, scale)
    nx = fields['nx']
    nz = fields['nz']
    comp_a, comp_b = components
    stride = max(1, math.ceil(max(nx, nz) / 18))
    arrow_length = max(5.0, scale * stride * ARROW_LENGTH_FACTOR)
    magnitudes = []
    for z in range(nz):
        for x in range(nx):
            pa = fields[comp_a][z][x]
            pb = fields[comp_b][z][x]
            if math.isfinite(pa) and math.isfinite(pb):
                magnitudes.append(math.sqrt(pa * pa + pb * pb))
    threshold = percentile(magnitudes, 95)
    for z in range(stride // 2, nz, stride):
        for x in range(stride // 2, nx, stride):
            pa = fields[comp_a][z][x]
            pb = fields[comp_b][z][x]
            norm = math.sqrt(pa * pa + pb * pb) if math.isfinite(pa) and math.isfinite(pb) else 0.0
            if norm <= 1e-12:
                continue
            frac = max(0.25, min(1.0, norm / threshold)) if threshold > 0 else 1.0
            cx = int(round((x + 0.5) * scale))
            cy = int(round((nz - z - 0.5) * scale))
            dx = pa / norm
            dy = -pb / norm
            ex = cx + dx * arrow_length * frac
            ey = cy + dy * arrow_length * frac
            draw_arrow(pixels, width, height, cx, cy, ex, ey)
    return write_rgb_png(width, height, pixels)


def variant_111_pixels(variant_id, scale=6):
    height = len(variant_id)
    width = len(variant_id[0]) if height else 0
    out_w = max(1, width * scale)
    out_h = max(1, height * scale)
    pixels = bytearray(out_w * out_h * 3)
    for y in range(out_h):
        src_y = height - 1 - min(height - 1, y // scale)
        for x in range(out_w):
            src_x = min(width - 1, x // scale)
            item = variant_id[src_y][src_x]
            color = VARIANT_111_COLORS[item] if 0 <= item < len(VARIANT_111_COLORS) else VARIANT_111_INVALID_COLOR
            set_pixel(pixels, out_w, out_h, x, y, color)
    return out_w, out_h, pixels


def render_variant_111_legend(width=260, row_height=28):
    height = row_height * (len(VARIANT_111_LABELS) + 2)
    pixels = bytearray(width * height * 3)
    for y in range(height):
        for x in range(width):
            set_pixel(pixels, width, height, x, y, (250, 250, 250))
    y0 = row_height
    for idx, color in enumerate(VARIANT_111_COLORS):
        top = y0 + idx * row_height
        for y in range(top + 4, top + row_height - 4):
            for x in range(12, 48):
                set_pixel(pixels, width, height, x, y, color)
        draw_variant_label(pixels, width, height, 64, top + 8, VARIANT_111_LABELS[idx])
    invalid_top = y0 + len(VARIANT_111_LABELS) * row_height
    for y in range(invalid_top + 4, invalid_top + row_height - 4):
        for x in range(12, 48):
            set_pixel(pixels, width, height, x, y, VARIANT_111_INVALID_COLOR)
    draw_variant_label(pixels, width, height, 64, invalid_top + 8, 'invalid')
    return write_rgb_png(width, height, pixels)


FONT_5X7 = {
    '[': ['011', '010', '010', '010', '010', '010', '011'],
    ']': ['110', '010', '010', '010', '010', '010', '110'],
    ',': ['0', '0', '0', '0', '0', '1', '1'],
    '-': ['000', '000', '000', '111', '000', '000', '000'],
    '1': ['010', '110', '010', '010', '010', '010', '111'],
    'i': ['1', '0', '1', '1', '1', '1', '1'],
    'n': ['0000', '0000', '1110', '1001', '1001', '1001', '1001'],
    'v': ['0000', '0000', '1001', '1001', '1001', '0110', '0110'],
    'a': ['0000', '0000', '0110', '0001', '0111', '1001', '0111'],
    'l': ['10', '10', '10', '10', '10', '10', '11'],
    'd': ['0001', '0001', '0111', '1001', '1001', '1001', '0111'],
}


def draw_variant_label(pixels, width, height, x, y, text, scale=2, color=(22, 29, 38)):
    cursor = x
    for char in text:
        glyph = FONT_5X7.get(char)
        if not glyph:
            cursor += 4 * scale
            continue
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit != '1':
                    continue
                for yy in range(scale):
                    for xx in range(scale):
                        set_pixel(pixels, width, height, cursor + gx * scale + xx, y + gy * scale + yy, color)
        cursor += (len(glyph[0]) + 1) * scale


def heatmap_png(values, vmin, vmax, scale=6):
    width, height, pixels = heatmap_pixels(values, vmin, vmax, scale)
    return write_rgb_png(width, height, pixels)


def heatmap_pixels(values, vmin, vmax, scale=6):
    height = len(values)
    width = len(values[0]) if height else 0
    out_w = max(1, width * scale)
    out_h = max(1, height * scale)
    pixels = bytearray(out_w * out_h * 3)
    for y in range(out_h):
        src_y = height - 1 - min(height - 1, y // scale)
        for x in range(out_w):
            src_x = min(width - 1, x // scale)
            set_pixel(pixels, out_w, out_h, x, y, color_for(values[src_y][src_x], vmin, vmax))
    return out_w, out_h, pixels


def vector_png_on_pz(fields, scale=6):
    pz_values = fields['pz']
    finite_pz = finite(pz_values)
    width, height, pixels = heatmap_pixels(pz_values, min(finite_pz), max(finite_pz), scale)
    nx = fields['nx']
    nz = fields['nz']
    stride = max(1, math.ceil(max(nx, nz) / 18))
    arrow_length = max(5.0, scale * stride * ARROW_LENGTH_FACTOR)
    for z in range(stride // 2, nz, stride):
        for x in range(stride // 2, nx, stride):
            px = fields['px'][z][x]
            pz = fields['pz'][z][x]
            norm = math.sqrt(px * px + pz * pz) if math.isfinite(px) and math.isfinite(pz) else 0.0
            if norm <= 1e-12:
                continue
            cx = int(round((x + 0.5) * scale))
            cy = int(round((nz - z - 0.5) * scale))
            dx = px / norm
            dy = -pz / norm
            ex = cx + dx * arrow_length
            ey = cy + dy * arrow_length
            draw_arrow(pixels, width, height, cx, cy, ex, ey)
    return write_rgb_png(width, height, pixels)


def draw_arrow(pixels, width, height, x0, y0, x1, y1):
    draw_line(pixels, width, height, x0, y0, x1, y1, (255, 255, 255), thickness=ARROW_OUTLINE_THICKNESS)
    draw_line(pixels, width, height, x0, y0, x1, y1, (22, 29, 38), thickness=ARROW_INNER_THICKNESS)
    angle = math.atan2(y1 - y0, x1 - x0)
    head_len = max(ARROW_HEAD_MIN, min(ARROW_HEAD_MAX, math.hypot(x1 - x0, y1 - y0) * ARROW_HEAD_FACTOR))
    for offset in (math.radians(150), -math.radians(150)):
        hx = x1 + math.cos(angle + offset) * head_len
        hy = y1 + math.sin(angle + offset) * head_len
        draw_line(pixels, width, height, x1, y1, hx, hy, (255, 255, 255), thickness=ARROW_OUTLINE_THICKNESS)
        draw_line(pixels, width, height, x1, y1, hx, hy, (22, 29, 38), thickness=ARROW_INNER_THICKNESS)


def draw_line(pixels, width, height, x0, y0, x1, y1, color, thickness=1):
    x0 = int(round(x0))
    y0 = int(round(y0))
    x1 = int(round(x1))
    y1 = int(round(y1))
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    x = x0
    y = y0
    while True:
        draw_point(pixels, width, height, x, y, color, thickness)
        if x == x1 and y == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x += sx
        if e2 <= dx:
            err += dx
            y += sy


def draw_point(pixels, width, height, x, y, color, thickness):
    radius = max(0, thickness // 2)
    for yy in range(y - radius, y + radius + 1):
        for xx in range(x - radius, x + radius + 1):
            set_pixel(pixels, width, height, xx, yy, color)


def set_pixel(pixels, width, height, x, y, color):
    if x < 0 or y < 0 or x >= width or y >= height:
        return
    idx = (y * width + x) * 3
    pixels[idx:idx + 3] = bytes(color)


def color_for(value, vmin, vmax):
    if not math.isfinite(value):
        return (230, 230, 230)
    if vmax <= vmin:
        t = 0.5
    else:
        t = max(0.0, min(1.0, (value - vmin) / (vmax - vmin)))
    if t < 0.5:
        f = t / 0.5
        r = int(49 + (245 - 49) * f)
        g = int(130 + (245 - 130) * f)
        b = int(189 + (245 - 189) * f)
    else:
        f = (t - 0.5) / 0.5
        r = int(245 + (202 - 245) * f)
        g = int(245 + (59 - 245) * f)
        b = int(245 + (59 - 245) * f)
    return (r, g, b)


def write_rgb_png(width, height, pixels):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    raw_scanlines = bytearray()
    row_len = width * 3
    for y in range(height):
        raw_scanlines.append(0)
        start = y * row_len
        raw_scanlines.extend(pixels[start:start + row_len])
    signature = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return signature + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(bytes(raw_scanlines), 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    main()
