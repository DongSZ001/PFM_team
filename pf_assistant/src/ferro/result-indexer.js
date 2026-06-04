'use strict';

const fs = require('fs');
const path = require('path');

function indexFerroResults({ jobId, caseDir, request = null }) {
  const outputs = fs.readdirSync(caseDir)
    .filter((name) => /^Polar\.\d{7}\.dat$/.test(name))
    .sort()
    .map((name) => ({ name }));
  const figuresDir = path.join(caseDir, 'figures');
  const assets = fs.existsSync(figuresDir)
    ? fs.readdirSync(figuresDir)
      .filter((name) => /^(Polar\.\d{7}_[A-Za-z0-9_-]+|polar_angle_legend|polar_variant_111_legend)\.png$/.test(name))
      .sort()
      .map((name) => ({
        name,
        title: titleForFigure(name),
        url: "/api/ferro/assets/" + encodeURIComponent(jobId) + "/" + encodeURIComponent(name),
      }))
    : [];
  return { outputs, assets, result: buildStructuredResult(assets, outputs, request, figuresDir) };
}

function buildStructuredResult(assets, outputs, request, figuresDir) {
  const timesteps = outputs.map((item) => timestepFromPolar(item.name)).filter((item) => item !== null);
  const visualizations = assets
    .filter((asset) => asset.name !== 'polar_angle_legend.png' && asset.name !== 'polar_variant_111_legend.png')
    .map((asset) => visualizationForAsset(asset, request))
    .filter(Boolean);
  const variantLegend = assets.find((asset) => asset.name === 'polar_variant_111_legend.png');
  const angleLegend = assets.find((asset) => asset.name === 'polar_angle_legend.png');
  const legendAsset = variantLegend || angleLegend;
  return {
    timesteps,
    visualizations,
    legend: legendAsset ? legendForAsset(legendAsset) : null,
    warnings: readVisualizationWarnings(figuresDir),
  };
}

function readVisualizationWarnings(figuresDir) {
  const warningPath = path.join(figuresDir, 'ferro_visualization_warnings.json');
  if (!fs.existsSync(warningPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(warningPath, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function legendForAsset(asset) {
  if (asset.name === 'polar_variant_111_legend.png') return { mode: 'variant_111', url: asset.url, label: 'R相 <111> 变体' };
  return { mode: 'inplane_angle', url: asset.url, label: '面内角度色轮图例' };
}

function visualizationForAsset(asset, request) {
  const match = asset.name.match(/^Polar\.(\d{7})_([A-Za-z0-9_-]+)\.png$/);
  if (!match) return null;
  const timestep = Number(match[1]);
  const suffix = match[2];
  const components = request && request.visualization && Array.isArray(request.visualization.inplaneComponents)
    ? request.visualization.inplaneComponents
    : ['px', 'pz'];
  if (suffix === 'inplane_angle') return { timestep, mode: 'inplane_angle', component: null, label: asset.title, components, overlay: { arrows: false }, url: asset.url };
  if (suffix === 'inplane_angle_arrow' || suffix === 'angle_arrow' || suffix === 'vector') {
    return { timestep, mode: 'inplane_angle', component: null, label: asset.title, components, projectionComponents: components, overlay: { arrows: true, projectionComponents: components }, url: asset.url };
  }
  if (suffix === 'variant_111') {
    return { timestep, mode: 'variant_111', component: null, label: asset.title, components: ['px', 'py', 'pz'], projectionComponents: projectionComponents(request), overlay: { arrows: false }, url: asset.url };
  }
  if (suffix === 'variant_111_arrow') {
    const projection = projectionComponents(request);
    return { timestep, mode: 'variant_111', component: null, label: asset.title, components: ['px', 'py', 'pz'], projectionComponents: projection, overlay: { arrows: true, projectionComponents: projection }, url: asset.url };
  }
  return { timestep, mode: 'component', component: suffix, components: [suffix], overlay: { arrows: true, projectionComponents: projectionComponents(request) }, label: asset.title, url: asset.url };
}

function projectionComponents(request) {
  const grid = request && request.grid || {};
  if (Number(grid.ny) === 1) return ['px', 'pz'];
  if (Number(grid.nz) === 1) return ['px', 'py'];
  if (Number(grid.nx) === 1) return ['py', 'pz'];
  const visualization = request && request.visualization || {};
  if (Array.isArray(visualization.inplaneComponents) && visualization.inplaneComponents.length === 2) return visualization.inplaneComponents;
  return ['px', 'py'];
}

function timestepFromPolar(name) {
  const match = String(name || '').match(/^Polar\.(\d{7})\.dat$/);
  return match ? Number(match[1]) : null;
}

function titleForFigure(name) {
  if (name === 'polar_angle_legend.png') return '面内角度色轮图例';
  if (name === 'polar_variant_111_legend.png') return 'R-BFO <111> 八变体图例';
  const match = name.match(/^Polar\.(\d{7})_([A-Za-z0-9_-]+)\.png$/);
  if (!match) return name;
  const step = Number(match[1]);
  if (match[2] === 'vector') return '极化取向箭头图 kt=' + step;
  if (match[2] === 'inplane_angle') return '面内角度颜色映射 kt=' + step;
  if (match[2] === 'inplane_angle_arrow' || match[2] === 'angle_arrow') return '面内 kt=' + step;
  if (match[2] === 'variant_111') return 'R相变体 kt=' + step;
  if (match[2] === 'variant_111_arrow') return 'R相变体 kt=' + step;
  return '极化 ' + match[2] + ' 分量 kt=' + step;
}

module.exports = { indexFerroResults, titleForFigure };
