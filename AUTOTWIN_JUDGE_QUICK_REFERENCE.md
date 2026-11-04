# AutoTwin: Judge Quick Reference (one page)

**Problem.** Seeing how a caliper or spark-plug change affects stress, stiffness or temperature normally needs CAD → mesh → FEA, and the intuition lives elsewhere.

**Solution.** One workspace that combines:
- animated component **twins**;
- an **A/B Design Lab** with instant, labelled **reduced-order estimates**;
- **deterministic PASS / NEEDS REVIEW / FAIL checks**;
- **AI Insights** (re-validated recommendations, a chat that can't overrule verdicts, a 3D view of the exact part that changes);
- a **real backend FEA** path.

**Architecture.**

| Layer | What it is |
|---|---|
| Browser | React 18 + Three.js (Vite): twins and estimates run in the browser; workspace saved in localStorage |
| Backend | FastAPI (Python 3.10): CadQuery CAD → Gmsh tetrahedral mesh → scikit-fem FEA (P2 elasticity / steady thermal) → constraint checks → SQLite + artifacts |
| AI | Optional Groq LLM through `POST /api/assistant/chat`; the key stays on the server; wording only |

**Modules.**

| Module | What really happens |
|---|---|
| Brake twin | Hydraulic lag; `F = (p − 0.25 MPa)·A_side`; `T = 2·μ·F·r_eff`, capped by tyre grip `μ·m·g·R`; wheel dynamics; lumped rotor temperature. **No stress.** |
| Spark twin | Exact slider-crank kinematics (86 × 86 mm, rod 143.5 mm, firing 1-3-4-2); crank-angle fire shader. **Tip temperatures are typed values.** |
| Wheel twin | Load transfer, spoke beam stresses, rig tests, fatigue *ranking* (not a life prediction) |
| Design Lab caliper | Beam estimate (rigid legs, bridge beam): baseline **4.621 kg, 97.2 MPa, 0.075 mm, FoS 2.47 → PASS** |
| Design Lab plug | Fin estimate: baseline tip **567 °C**, hottest **701 °C**, idle **290 °C → NEEDS REVIEW** |
| Backend FEA (Experiment → "Run on solver") | Baseline caliper **144.1 MPa, 0.080 mm, 4.487 kg**, about 53 k DOF, about 1 min per candidate. Plug **384–622 °C**, about 1–2 s |

**Parameter interactions (the ones to demo).**
- **Brake twin:** pressure 4 → 8 MPa: torque ≈ 919 → capped at ≈ 1,295 N·m; "grip-limited"; decel ≈ 0.68 → 0.96 g.
- **Caliper:** bridge thickness ↑ → stress ≈ h², opening ≈ h³ ↓, mass ↑. Aluminium → lighter, opens about 2.3× more.
- **Plug:** nose length ↑ → hotter tip; copper core → cooler; electrode Ø ↑ → cooler.

**A vs B.**
- **Design Lab:** genuinely different parameter vectors evaluated by the **same** estimator under the **same** load case. A fair screening comparison. B starts as a copy of A.
- **Spark twin:** "A / B" differ by colour and typed temperature only.
- **Brake twin:** no A / B.
- **Backend solver:** runs its template plus DOE candidates, **not** the Design Lab B (not wired yet).

**What is really computed.**
- Exact kinematics.
- Simplified dynamics (twins).
- Uncalibrated closed-form estimates (Design Lab, Experiment, Analytics, Reports).
- **Real FEA** in the backend: 9 benchmark tests pass; stored runs exist.

**Tests (this audit):** 278 frontend checks in 8 suites pass; backend 139 fast + 9 benchmark tests pass.

**Strongest innovation.** An explainable, closed decision loop:
1. deterministic verdicts;
2. recommendations found by search and re-validated;
3. a 3D morph of the exact part, with estimates recomputed along the way;
4. an AI chat that explains but can't overrule;
5. finalized decision records.

All of it is backed by a real CAD → mesh → FEA pipeline.

**Limitations (say them first).**
- Estimates are not calibrated to FEA.
- A/B designs are not sent to FEA.
- Limits and material data are demo fixtures.
- No physical validation.
- No live sensor link (virtual prototype, not an operational twin).
- The wheel isn't in Experiment / Insights / Reports.
- NSGA-II, the requirement parser and the FEA 3D field views exist in the backend but aren't wired into the UI.

**Never claim:** certified, validated, real-time FEA, AI-generated geometry, cost savings, computed tip temperatures in the engine twin.

**Demo sequence (about 6 min).**
1. Dashboard (problem, "What's real").
2. Spark twin at 3000 rpm.
3. Design Lab plug: B nose = 5 mm → FAIL (436 °C).
4. AI Insights: "nose 5.0 → 5.8 mm", 3D nose glows, about 481 °C, PASS.
5. Brake twin: 4 → 8 MPa, grip limit.
6. Design Lab caliper: B = A356 with an 18 mm bridge → FAIL (0.24 mm, FoS 1.38).
7. Chat "Optimise B for me" → bridge 23 mm → PASS; show the Legs & mouth view.
8. Experiment: A vs B single stop.
9. Experiment: "Run on solver" (or a stored run): 144 MPa / 0.080 mm baseline FEA; failed candidates listed with reasons.
10. Close with the limitations and the next step (send A/B to FEA, calibrate).
