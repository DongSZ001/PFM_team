/**
 * Seed catalogue of parameter definitions.
 *
 * Adding a new parameter type (e.g. ferroelectric, thermal) is just a
 * matter of adding an entry here.  No schema migration is needed because
 * parameter_values stores its semantic via parameter_definition_id.
 */

'use strict';

const DEFAULT_PARAMETER_DEFINITIONS = [
  // ---- magnetic ----
  { parameter_key: 'Aex',             display_name: 'Exchange stiffness A',          category: 'magnetic',         si_unit: 'J/m',         display_unit: 'pJ/m',          value_type: 'number', description: 'Exchange constant; energy per unit length' },
  { parameter_key: 'Ms',              display_name: 'Saturation magnetization Ms',  category: 'magnetic',         si_unit: 'A/m',         display_unit: 'kA/m',          value_type: 'number', description: 'Spontaneous magnetization' },
  { parameter_key: 'alpha',           display_name: 'Gilbert damping α',             category: 'magnetic',         si_unit: 'dimensionless', display_unit: 'dimensionless', value_type: 'number', description: 'Gilbert damping coefficient' },
  { parameter_key: 'gamma0',          display_name: 'Gyromagnetic ratio γ₀',         category: 'magnetic',         si_unit: 'rad/(T*s)',  display_unit: 'rad/(T*s)',     value_type: 'number', description: 'Gyromagnetic ratio; sign preserved' },
  { parameter_key: 'B_ext',           display_name: 'External magnetic field B',     category: 'magnetic',         si_unit: 'T',           display_unit: 'mT',            value_type: 'number', description: 'Applied external field' },

  // ---- anisotropy ----
  { parameter_key: 'anisotropy_type', display_name: 'Anisotropy type',               category: 'anisotropy',       si_unit: '',            display_unit: '',               value_type: 'text',   description: 'e.g. uniaxial / cubic / interfacial' },
  { parameter_key: 'Ku1',             display_name: 'Anisotropy constant K1 (uniaxial) or Ku', category: 'anisotropy', si_unit: 'J/m^3', display_unit: 'kJ/m^3', value_type: 'number', description: 'Primary anisotropy energy density' },
  { parameter_key: 'Ku2',             display_name: 'Anisotropy constant K2',        category: 'anisotropy',       si_unit: 'J/m^3',       display_unit: 'kJ/m^3',        value_type: 'number', description: 'Secondary anisotropy energy density' },

  // ---- DMI ----
  { parameter_key: 'DMI_type',        display_name: 'DMI type',                      category: 'dmi',              si_unit: '',            display_unit: '',               value_type: 'text',   description: 'e.g. Interface / Bulk / None' },
  { parameter_key: 'D',               display_name: 'DMI constant D',                category: 'dmi',              si_unit: 'J/m^2',       display_unit: 'mJ/m^2',        value_type: 'number', description: 'Dzyaloshinskii-Moriya interaction; 1 mJ/m^2 = 1e-3 J/m^2' },

  // ---- elastic ----
  { parameter_key: 'c11',             display_name: 'Elastic constant c11',          category: 'elastic',          si_unit: 'Pa',          display_unit: 'GPa',           value_type: 'number', description: 'Cubic elastic constant' },
  { parameter_key: 'c12',             display_name: 'Elastic constant c12',          category: 'elastic',          si_unit: 'Pa',          display_unit: 'GPa',           value_type: 'number', description: 'Cubic elastic constant' },
  { parameter_key: 'c44',             display_name: 'Elastic constant c44',          category: 'elastic',          si_unit: 'Pa',          display_unit: 'GPa',           value_type: 'number', description: 'Cubic elastic constant' },
  { parameter_key: 'young_modulus',   display_name: "Young's modulus E",             category: 'elastic',          si_unit: 'Pa',          display_unit: 'GPa',           value_type: 'number', description: 'Effective Young modulus; 1 GPa = 1e9 Pa' },
  { parameter_key: 'poisson_ratio',   display_name: "Poisson's ratio ν",             category: 'elastic',          si_unit: 'dimensionless', display_unit: 'dimensionless', value_type: 'number', description: 'Effective Poisson ratio' },

  // ---- magnetostriction ----
  { parameter_key: 'lambda100',       display_name: 'Magnetostriction λ₁₀₀',         category: 'magnetostriction', si_unit: 'dimensionless', display_unit: 'ppm',        value_type: 'number', description: 'Cubic magnetostriction along ⟨100⟩' },
  { parameter_key: 'lambda111',       display_name: 'Magnetostriction λ₁₁₁',         category: 'magnetostriction', si_unit: 'dimensionless', display_unit: 'ppm',        value_type: 'number', description: 'Cubic magnetostriction along ⟨111⟩' },

  // ---- magnetoelastic ----
  { parameter_key: 'b1',              display_name: 'Magnetoelastic coupling b1',    category: 'magnetoelastic',   si_unit: 'J/m^3',       display_unit: 'MJ/m^3',        value_type: 'number', description: '1 Pa = 1 J/m^3. Watch the unit for small numbers.' },
  { parameter_key: 'b2',              display_name: 'Magnetoelastic coupling b2',    category: 'magnetoelastic',   si_unit: 'J/m^3',       display_unit: 'MJ/m^3',        value_type: 'number', description: '1 Pa = 1 J/m^3. Watch the unit for small numbers.' },
  { parameter_key: 'B1_from_lambda100', display_name: 'Derived magnetoelastic B1 (from λ100)', category: 'magnetoelastic', si_unit: 'J/m^3', display_unit: 'MJ/m^3', value_type: 'number', description: 'Derived from λ100; is_derived=1' },
  { parameter_key: 'B2_from_lambda100', display_name: 'Derived magnetoelastic B2 (from λ111)', category: 'magnetoelastic', si_unit: 'J/m^3', display_unit: 'MJ/m^3', value_type: 'number', description: 'Derived from λ100/λ111; is_derived=1' },
];

module.exports = { DEFAULT_PARAMETER_DEFINITIONS };
