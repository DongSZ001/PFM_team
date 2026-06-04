'use strict';

const fs = require('fs');
const path = require('path');

const IMAGE_TITLES = Object.freeze({
  'phase_map.png': '相分布',
  'phase_map_3d.png': '三维相分布',
  'elePtntl.00000000.png': '电势分布',
  'eleField.00000000_magnitude.png': '电场强度',
  'eleField.00000000_magnitude_3d.png': '三维电场强度',
  'eleField.00000000_vectors.png': '电场矢量',
  'eleField.00000000_vectors_3d.png': '三维电场矢量',
  'eleDspl.00000000_magnitude.png': '电位移强度',
  'eleDspl.00000000_magnitude_3d.png': '三维电位移强度',
  'eleDspl.00000000_vectors.png': '电位移矢量',
  'eleDspl.00000000_vectors_3d.png': '三维电位移矢量',
  'elePlrz.00000000_magnitude.png': '极化强度',
  'elePlrz.00000000_magnitude_3d.png': '三维极化强度',
  'elePlrz.00000000_vectors.png': '极化矢量',
  'elePlrz.00000000_vectors_3d.png': '三维极化矢量',
  'tempGrad.00000000_magnitude.png': '温度梯度强度',
  'tempGrad.00000000_magnitude_3d.png': '三维温度梯度强度',
  'tempGrad.00000000_vectors.png': '温度梯度矢量',
  'tempGrad.00000000_vectors_3d.png': '三维温度梯度矢量',
  'heatFlux.00000000_magnitude.png': '热流强度',
  'heatFlux.00000000_magnitude_3d.png': '三维热流强度',
  'heatFlux.00000000_vectors.png': '热流矢量',
  'heatFlux.00000000_vectors_3d.png': '三维热流矢量',
  'concGrad.00000000_magnitude.png': '浓度梯度强度',
  'concGrad.00000000_magnitude_3d.png': '三维浓度梯度强度',
  'concGrad.00000000_vectors.png': '浓度梯度矢量',
  'concGrad.00000000_vectors_3d.png': '三维浓度梯度矢量',
  'molFlux.00000000_magnitude.png': '摩尔通量强度',
  'molFlux.00000000_magnitude_3d.png': '三维摩尔通量强度',
  'molFlux.00000000_vectors.png': '摩尔通量矢量',
  'molFlux.00000000_vectors_3d.png': '三维摩尔通量矢量',
  'elecCurr.00000000_magnitude.png': '电流密度强度',
  'elecCurr.00000000_magnitude_3d.png': '三维电流密度强度',
  'elecCurr.00000000_vectors.png': '电流密度矢量',
  'elecCurr.00000000_vectors_3d.png': '三维电流密度矢量',
  'strain.00000000_magnitude.png': '应变强度',
  'strain.00000000_magnitude_3d.png': '三维应变强度',
  'stress.00000000_magnitude.png': '应力强度',
  'stress.00000000_magnitude_3d.png': '三维应力强度',
  'magField.00000000_magnitude.png': '磁场强度',
  'magField.00000000_magnitude_3d.png': '三维磁场强度',
  'magField.00000000_vectors.png': '磁场矢量',
  'magField.00000000_vectors_3d.png': '三维磁场矢量',
  'magnetiz.00000000_magnitude.png': '磁化强度',
  'magnetiz.00000000_magnitude_3d.png': '三维磁化强度',
  'magIndc.00000000_magnitude.png': '磁感应强度',
  'magIndc.00000000_magnitude_3d.png': '三维磁感应强度',
});

function indexEfffieldResults({ jobId, caseDir, tensorPreference = null }) {
  const outputDir = path.join(caseDir, 'output');
  const figuresDir = path.join(caseDir, 'figures');
  const outputs = listFiles(outputDir, '.dat').map((file) => ({
    name: file,
    path: path.join(outputDir, file),
  }));
  const assets = listFiles(figuresDir, '.png').map((file) => ({
    kind: 'image',
    name: file,
    title: IMAGE_TITLES[file] || file.replace(/\.png$/i, ''),
    url: `/api/efffield/assets/${encodeURIComponent(jobId)}/${encodeURIComponent(file)}`,
  }));
  const tensorCandidates = [
    tensorPreference,
    'effElasticStiffness.dat',
    'effDielectricPermittivity.dat',
    'effPiezoelectricDTensor.dat',
    'effMagneticPermeability.dat',
    'effPiezomagneticQTensor.dat',
    'effMagnetoelectricTensor.dat',
    'effDiffusivity.dat',
    'effThermalConductivity.dat',
    'effElectricalConductivity.dat',
  ].filter(Boolean);
  const effectiveTensor = readFirstExisting(outputDir, tensorCandidates);
  return { outputs, assets, effectiveTensor };
}

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .sort();
}

function readFirstExisting(dir, names) {
  for (const name of names) {
    const filePath = path.join(dir, name);
    if (fs.existsSync(filePath)) {
      return { name, text: fs.readFileSync(filePath, 'utf8').trim() };
    }
  }
  return null;
}

module.exports = { indexEfffieldResults };
