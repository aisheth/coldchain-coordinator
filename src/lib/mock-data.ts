import type { AppState, CatalogueItem } from "./types";

const v = (...labels: string[]) => labels.map((label) => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label }));
const daysFromNow = (d: number, h = 10) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export const catalogue: CatalogueItem[] = [
  { id: "copper-wire", name: "Copper Wire", category: "Electrical", unit: "roll", variants: v("1 metre", "2 metres", "5 metres", "10 metres") },
  { id: "puf-panel", name: "PUF Insulation Panel", category: "Insulation", unit: "sheet", variants: v("60 mm", "80 mm", "100 mm", "150 mm") },
  { id: "xps-sheet", name: "XPS Insulation Sheet", category: "Insulation", unit: "sheet", variants: v("25 mm", "50 mm") },
  { id: "copper-pipe", name: "Refrigeration Copper Pipe", category: "Refrigeration Pipes", unit: "coil", variants: v("1/4 inch", "3/8 inch", "1/2 inch", "5/8 inch", "7/8 inch") },
  { id: "pipe-insulation", name: "Pipe Insulation Tube", category: "Refrigeration Pipes", unit: "piece", variants: v("1/4 inch", "1/2 inch", "7/8 inch") },
  { id: "mcb", name: "MCB Breaker", category: "Electrical", unit: "piece", variants: v("16 A", "32 A", "63 A") },
  { id: "contactor", name: "Contactor", category: "Electrical", unit: "piece", variants: v("9 A", "18 A", "32 A") },
  { id: "thermostat", name: "Digital Temperature Controller", category: "Electrical", unit: "piece", variants: v("Single probe", "Dual probe") },
  { id: "refrigerant", name: "Refrigerant Gas", category: "Refrigeration", unit: "cylinder", variants: v("R404A 10.9 kg", "R134a 13.6 kg", "R290 5 kg") },
  { id: "compressor", name: "Condensing Unit", category: "Refrigeration", unit: "unit", variants: v("3 HP", "5 HP", "7.5 HP") },
  { id: "anchor-bolt", name: "Anchor Bolt", category: "Fasteners", unit: "box", variants: v("M8 x 75", "M10 x 100", "M12 x 120") },
  { id: "self-tap", name: "Self-tapping Screw", category: "Fasteners", unit: "box", variants: v("8 x 1 inch", "10 x 2 inch") },
  { id: "silicone", name: "Silicone Sealant", category: "Installation", unit: "tube", variants: v("Clear 280 ml", "White 280 ml") },
  { id: "door", name: "Cold Room Hinged Door", category: "Installation", unit: "unit", variants: v("800 x 1800 mm", "1000 x 2000 mm") },
  { id: "pvc-curtain", name: "PVC Strip Curtain", category: "Installation", unit: "roll", variants: v("200 mm", "300 mm") },
];

export function seed(): AppState {
  return {
    currentWorkerId: "w1",
    catalogue,
    workers: [
      { id: "w1", name: "Ravi Patel", phone: "+91 98250 11234", area: "Ahmedabad East" },
      { id: "w2", name: "Imran Shaikh", phone: "+91 99099 45210", area: "Vadodara" },
      { id: "w3", name: "Suresh Yadav", phone: "+91 97240 77810", area: "Surat" },
      { id: "w4", name: "Mahesh Chauhan", phone: "+91 90990 31455", area: "Ahmedabad West" },
    ],
    vendors: [
      { id: "v1", name: "Shree Ganesh Refrigeration", contact: "Nilesh Shah", phone: "+91 79 2658 1100", address: "Naroda GIDC, Ahmedabad", specialty: "Compressors, gas, copper pipe" },
      { id: "v2", name: "Polar Insulation Pvt Ltd", contact: "Kavita Mehta", phone: "+91 265 233 4400", address: "Makarpura GIDC, Vadodara", specialty: "PUF & XPS panels" },
      { id: "v3", name: "Bharat Electricals", contact: "Ajay Joshi", phone: "+91 79 2550 9876", address: "Relief Road, Ahmedabad", specialty: "MCBs, wiring, controllers" },
      { id: "v4", name: "Surat Hardware Mart", contact: "Farhan Ali", phone: "+91 261 245 3321", address: "Udhna, Surat", specialty: "Fasteners, sealants" },
    ],
    projects: [
      { id: "p1", ref: "CS-2026-041", name: "Dairy chiller room", customer: "Amul Milk Collection Centre", contact: "Hitesh Desai", phone: "+91 98980 22110", address: "Plot 14, Sanand Industrial Estate, Ahmedabad", description: "20 x 15 ft chiller room at +4°C with 5 HP condensing unit.", deploymentDate: daysFromNow(9), status: "procurement", createdAt: hoursAgo(120) },
      { id: "p2", ref: "CS-2026-042", name: "Pharma cold store", customer: "MediCare Distributors", contact: "Dr. Pooja Iyer", phone: "+91 99250 66001", address: "Shed 7, Por GIDC, Vadodara", description: "2–8°C storage for vaccines, dual controller with alarm.", deploymentDate: daysFromNow(14), status: "procurement", createdAt: hoursAgo(72) },
      { id: "p3", ref: "CS-2026-043", name: "Frozen food freezer", customer: "FreshBite Foods", contact: "Rakesh Agarwal", phone: "+91 97140 55120", address: "Sachin GIDC, Surat", description: "-18°C blast freezer, 150 mm PUF panels.", deploymentDate: daysFromNow(21), status: "planning", createdAt: hoursAgo(30) },
      { id: "p4", ref: "CS-2026-038", name: "Flower cold room", customer: "Bloom Florists", contact: "Sneha Kapoor", phone: "+91 98240 90011", address: "Bodakdev, Ahmedabad", description: "Small walk-in at +6°C.", deploymentDate: daysFromNow(-4), status: "completed", createdAt: hoursAgo(400) },
    ],
    tasks: [
      { id: "t1", ref: "PR-1001", projectId: "p1", workerId: "w1", vendorId: "v1", deliverySite: "Plot 14, Sanand Industrial Estate, Ahmedabad", dueDate: daysFromNow(2), instructions: "Check brazing on condensing unit before loading. Get GST bill.", status: "procurement", createdAt: hoursAgo(26),
        materials: [ { itemId: "compressor", variantId: "5-hp", qty: 1 }, { itemId: "copper-pipe", variantId: "1-2-inch", qty: 2 }, { itemId: "copper-pipe", variantId: "7-8-inch", qty: 1 }, { itemId: "refrigerant", variantId: "r404a-10-9-kg", qty: 2, remarks: "Sealed cylinders only" } ],
        events: [
          { id: "e1", at: hoursAgo(26), by: "Owner", status: "assigned", note: "Task assigned" },
          { id: "e2", at: hoursAgo(25), by: "Ravi Patel", status: "accepted" },
          { id: "e3", at: hoursAgo(5), by: "Ravi Patel", status: "travelling" },
          { id: "e4", at: hoursAgo(4), by: "Ravi Patel", status: "reached_vendor" },
          { id: "e5", at: hoursAgo(3.5), by: "Ravi Patel", status: "availability_confirmed", note: "All items available. 7/8 pipe from back godown." },
          { id: "e6", at: hoursAgo(2), by: "Ravi Patel", status: "procurement", note: "Billing in process" },
        ] },
      { id: "t2", ref: "PR-1002", projectId: "p2", workerId: "w2", vendorId: "v2", deliverySite: "Shed 7, Por GIDC, Vadodara", dueDate: daysFromNow(1), instructions: "Panels must be cam-lock type.", status: "issue", createdAt: hoursAgo(48),
        materials: [ { itemId: "puf-panel", variantId: "100-mm", qty: 24 }, { itemId: "door", variantId: "800-x-1800-mm", qty: 1 } ],
        events: [
          { id: "e7", at: hoursAgo(48), by: "Owner", status: "assigned", note: "Task assigned" },
          { id: "e8", at: hoursAgo(46), by: "Imran Shaikh", status: "accepted" },
          { id: "e9", at: hoursAgo(6), by: "Imran Shaikh", status: "reached_vendor" },
          { id: "e10", at: hoursAgo(5), by: "Imran Shaikh", status: "issue", note: "Only 16 panels of 100 mm in stock. Remaining 8 in 3 days." },
        ] },
      { id: "t3", ref: "PR-1003", projectId: "p1", workerId: "w4", vendorId: "v3", deliverySite: "Plot 14, Sanand Industrial Estate, Ahmedabad", dueDate: daysFromNow(3), instructions: "", status: "assigned", createdAt: hoursAgo(1),
        materials: [ { itemId: "mcb", variantId: "32-a", qty: 2 }, { itemId: "copper-wire", variantId: "5-metres", qty: 4 }, { itemId: "thermostat", variantId: "single-probe", qty: 1 } ],
        events: [ { id: "e11", at: hoursAgo(1), by: "Owner", status: "assigned", note: "Task assigned" } ] },
      { id: "t4", ref: "PR-0994", projectId: "p4", workerId: "w1", vendorId: "v4", deliverySite: "Bodakdev, Ahmedabad", dueDate: daysFromNow(-6), instructions: "", status: "completed", createdAt: hoursAgo(300),
        materials: [ { itemId: "anchor-bolt", variantId: "m10-x-100", qty: 2 }, { itemId: "silicone", variantId: "white-280-ml", qty: 12 } ],
        events: [
          { id: "e12", at: hoursAgo(300), by: "Owner", status: "assigned" },
          { id: "e13", at: hoursAgo(290), by: "Ravi Patel", status: "dispatched" },
          { id: "e14", at: hoursAgo(286), by: "Ravi Patel", status: "delivered" },
          { id: "e15", at: hoursAgo(285), by: "Ravi Patel", status: "completed", note: "Handed to site supervisor" },
        ] },
    ],
  };
}
