/**
 * Industries and engineering materials for user-added components. Material
 * values are typical handbook figures for a first estimate (mass, stiffness,
 * strength), not a certified datasheet.
 */

export interface Industry {
  id: string;
  label: string;
  /** Example part types, offered as suggestions for the category field. */
  examples: string[];
}

export const INDUSTRIES: Industry[] = [
  { id: 'automotive', label: 'Automotive', examples: ['Bracket', 'Brake caliper', 'Control arm', 'Wheel', 'Housing', 'Gear', 'Piston'] },
  { id: 'aerospace', label: 'Aerospace & defence', examples: ['Bracket', 'Rib', 'Turbine blade', 'Fitting', 'Landing gear part', 'Panel'] },
  { id: 'medical', label: 'Medical devices', examples: ['Implant', 'Surgical instrument', 'Housing', 'Prosthetic part', 'Fixture'] },
  { id: 'energy', label: 'Energy & power', examples: ['Turbine blade', 'Flange', 'Heat exchanger part', 'Busbar', 'Mount'] },
  { id: 'oil-gas', label: 'Oil & gas', examples: ['Valve body', 'Flange', 'Pipe fitting', 'Pump impeller'] },
  { id: 'machinery', label: 'Industrial machinery', examples: ['Shaft', 'Gear', 'Bearing housing', 'Frame', 'Coupling', 'Pulley'] },
  { id: 'robotics', label: 'Robotics & automation', examples: ['Arm link', 'Gripper finger', 'Motor mount', 'End effector'] },
  { id: 'consumer', label: 'Consumer products', examples: ['Enclosure', 'Handle', 'Clip', 'Hinge', 'Bottle'] },
  { id: 'electronics', label: 'Electronics', examples: ['Enclosure', 'Heat sink', 'Connector', 'PCB bracket'] },
  { id: 'marine', label: 'Marine', examples: ['Propeller', 'Cleat', 'Rudder part', 'Hull fitting'] },
  { id: 'rail', label: 'Rail', examples: ['Bogie part', 'Brake disc', 'Coupler', 'Bracket'] },
  { id: 'construction', label: 'Construction & civil', examples: ['Beam', 'Connector plate', 'Anchor', 'Column base'] },
  { id: 'agriculture', label: 'Agriculture', examples: ['Tine', 'Blade', 'Hitch part', 'Bracket'] },
  { id: 'other', label: 'Other', examples: ['Part', 'Assembly', 'Prototype'] },
];

export interface CustomMaterial {
  id: string;
  name: string;
  family: 'Steel' | 'Iron' | 'Aluminium' | 'Titanium' | 'Nickel' | 'Copper' | 'Magnesium' | 'Polymer' | 'Composite' | 'Other';
  densityKgM3: number;
  youngsGPa: number | null;
  /** Yield (metals) or tensile strength (polymers, composites), MPa. */
  strengthMPa: number | null;
}

export const MATERIALS: CustomMaterial[] = [
  { id: 's355', name: 'Structural steel S355', family: 'Steel', densityKgM3: 7850, youngsGPa: 210, strengthMPa: 355 },
  { id: '42crmo4', name: 'Alloy steel 42CrMo4 (Q+T)', family: 'Steel', densityKgM3: 7850, youngsGPa: 210, strengthMPa: 750 },
  { id: 'ss304', name: 'Stainless steel 304', family: 'Steel', densityKgM3: 8000, youngsGPa: 193, strengthMPa: 215 },
  { id: 'ss316l', name: 'Stainless steel 316L', family: 'Steel', densityKgM3: 8000, youngsGPa: 193, strengthMPa: 170 },
  { id: 'gjs500', name: 'Ductile iron EN-GJS-500-7', family: 'Iron', densityKgM3: 7100, youngsGPa: 169, strengthMPa: 320 },
  { id: 'gjl250', name: 'Grey cast iron EN-GJL-250', family: 'Iron', densityKgM3: 7200, youngsGPa: 110, strengthMPa: null },
  { id: 'al6061', name: 'Aluminium 6061-T6', family: 'Aluminium', densityKgM3: 2700, youngsGPa: 69, strengthMPa: 276 },
  { id: 'al7075', name: 'Aluminium 7075-T6', family: 'Aluminium', densityKgM3: 2810, youngsGPa: 72, strengthMPa: 503 },
  { id: 'a356', name: 'Cast aluminium A356-T6', family: 'Aluminium', densityKgM3: 2680, youngsGPa: 72, strengthMPa: 200 },
  { id: 'ti64', name: 'Titanium Ti-6Al-4V', family: 'Titanium', densityKgM3: 4430, youngsGPa: 114, strengthMPa: 880 },
  { id: 'in718', name: 'Inconel 718', family: 'Nickel', densityKgM3: 8190, youngsGPa: 200, strengthMPa: 1030 },
  { id: 'cu110', name: 'Copper C110', family: 'Copper', densityKgM3: 8940, youngsGPa: 115, strengthMPa: 69 },
  { id: 'brass360', name: 'Brass C360', family: 'Copper', densityKgM3: 8500, youngsGPa: 97, strengthMPa: 310 },
  { id: 'az91d', name: 'Magnesium AZ91D', family: 'Magnesium', densityKgM3: 1810, youngsGPa: 45, strengthMPa: 160 },
  { id: 'pa66', name: 'Nylon PA66 (dry)', family: 'Polymer', densityKgM3: 1140, youngsGPa: 3.0, strengthMPa: 80 },
  { id: 'pa66gf30', name: 'Nylon PA66-GF30', family: 'Polymer', densityKgM3: 1370, youngsGPa: 9.5, strengthMPa: 180 },
  { id: 'abs', name: 'ABS', family: 'Polymer', densityKgM3: 1050, youngsGPa: 2.3, strengthMPa: 40 },
  { id: 'pc', name: 'Polycarbonate', family: 'Polymer', densityKgM3: 1200, youngsGPa: 2.4, strengthMPa: 62 },
  { id: 'peek', name: 'PEEK', family: 'Polymer', densityKgM3: 1320, youngsGPa: 3.6, strengthMPa: 100 },
  { id: 'pla', name: 'PLA (3D printed, solid)', family: 'Polymer', densityKgM3: 1240, youngsGPa: 3.5, strengthMPa: 50 },
  { id: 'cfrp', name: 'Carbon fibre / epoxy (quasi-isotropic)', family: 'Composite', densityKgM3: 1600, youngsGPa: 70, strengthMPa: 600 },
  { id: 'gfrp', name: 'Glass fibre / epoxy', family: 'Composite', densityKgM3: 1900, youngsGPa: 25, strengthMPa: 250 },
  { id: 'concrete', name: 'Concrete C30/37', family: 'Other', densityKgM3: 2400, youngsGPa: 33, strengthMPa: null },
  { id: 'timber', name: 'Softwood timber C24', family: 'Other', densityKgM3: 420, youngsGPa: 11, strengthMPa: 24 },
];

export const findMaterial = (id: string) => MATERIALS.find((m) => m.id === id);
export const findIndustry = (id: string) => INDUSTRIES.find((i) => i.id === id);
