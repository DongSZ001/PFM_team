# Ferroelectric Landau Coefficient Database

> Source file: `Ferroelectric Landau Coefficients.docx`
>
> Purpose: a Markdown-format, Codex-readable database of Landau free-energy coefficients, electrostrictive coefficients, elastic stiffnesses, and elastic compliances collected from the source document.
>
> Status: curated extraction from the uploaded document; values have not been independently verified against the original papers.

## 1. Conventions

- `T` is the temperature variable. The `T_unit` field in `source_sets` specifies whether the table uses K or degree_C.
- `x` is the composition variable where applicable. For PZT, `x` denotes Ti fraction in `PbZr1-xTixO3`. For KNN, `x` denotes Na fraction in `K1-xNaxNbO3`.
- Coefficients written as `a1`, `a11`, etc. in some sources are normalized here as `alpha1`, `alpha11`, etc. to keep one database key style.
- `value_expression` is intentionally stored as a string. It is code-like but not guaranteed to be directly executable without defining functions such as `coth()` and auxiliary variables such as `C_curie(x)`.
- When `unit_reported` begins with a scale such as `10^5`, the numerical `value_expression` should be interpreted with that unit scale as reported in the table, rather than as already fully SI-normalized.
- Empty cells in the Word tables are omitted from `coefficient_records`.

## 2. Suggested Landau polynomial key

For common cubic/perovskite-style three-component polarization notation, the coefficient names correspond to terms of the form:

```text
F_L = alpha1*(P1^2 + P2^2 + P3^2)
    + alpha11*(P1^4 + P2^4 + P3^4)
    + alpha12*(P1^2*P2^2 + P2^2*P3^2 + P1^2*P3^2)
    + alpha111*(P1^6 + P2^6 + P3^6)
    + alpha112*[P1^4*(P2^2+P3^2) + P2^4*(P1^2+P3^2) + P3^4*(P1^2+P2^2)]
    + alpha123*(P1^2*P2^2*P3^2)
    + alpha1111*(P1^8 + P2^8 + P3^8)
    + alpha1112*[P1^6*(P2^2+P3^2) + cyclic]
    + alpha1122*(P1^4*P2^4 + P2^4*P3^4 + P1^4*P3^4)
    + alpha1123*[P1^4*P2^2*P3^2 + P2^4*P1^2*P3^2 + P3^4*P1^2*P2^2]
```

## 3. Source sets

| set_id | material_id | material_name | composition | source_ref | order | T_unit | variables | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTO_Wang2010_modified | BTO | BaTiO3 | BaTiO3 | [1] | eighth_order | K | T, Ts=160 K, sigma1, sigma2, sigma3 | Modified Wang potential; stress/pressure correction terms retained as printed. Set sigma terms to 0 if unused. |
| BTO_BellCross_from_Wang2010 | BTO | BaTiO3 | BaTiO3 | [1] | sixth_order | K | T | Bell and Cross parameter set reproduced in Wang et al. [1]. |
| BTO_Li_from_Wang2010 | BTO | BaTiO3 | BaTiO3 | [1] | eighth_order | K | T | Li et al. parameter set reproduced in Wang et al. [1]. |
| BTO_Wang2010 | BTO | BaTiO3 | BaTiO3 | [1] | eighth_order | K | T | Wang et al. parameter set in Wang et al. [1]. |
| PVDFTrFE_70_30_Qiu2011 | PVDF-TrFE | P(VDF-TrFE) | 70/30 | [2] | sixth_order | K | T |  |
| PVDFTrFE_65_35_Qiu2011 | PVDF-TrFE | P(VDF-TrFE) | 65/35 | [2] | sixth_order | K | T |  |
| PVDFTrFE_70_30_Bai2019 | PVDF-TrFE | P(VDF-TrFE) | 70/30 | [3] | sixth_order | K | T | uncertainty notation ± |
| PVDFTrFE_65_35_Bai2019 | PVDF-TrFE | P(VDF-TrFE) | 65/35 | [3] | sixth_order | K | T |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-PT | PMN-0.30PT | [4] | sixth_order | K | T |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-PT | PMN-0.42PT | [4] | sixth_order | K | T |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-PT | PMN-0.70PT | [4] | sixth_order | K | T |  |
| BFO_Zhang2008_fourth | BFO | BiFeO3 | BiFeO3 | [5] | fourth_order | K | T |  |
| BFO_Hsieh2016_sixth | BFO | BiFeO3 | BiFeO3 | [6] | sixth_order | K | T |  |
| BFO_Cao2018_eighth | BFO | BiFeO3 | BiFeO3 | [7] | eighth_order | K | T |  |
| PZT_PbTiO3_Li2005 | PZT | PbTiO3 | PbTiO3 | [8] | sixth_order | K | T |  |
| PZT_Haun1989_composition | PZT | PbZr1-xTixO3 | 0 <= x <= 1 | [9] | sixth_order | degree_C | T, x, epsilon0, C_curie(x), T0(x), n1(x), n2(x) | Composition-dependent Haun formula. x is Ti composition. Original document has a minor conflict in n1: earlier rendered Table 3 shows 0.012301*x, later consolidated table shows 0.012501*x. |
| KNN_K05Na05NbO3_Pohlmann2017 | KNN | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | [10] | eighth_order | K | T |  |
| KNN_KNbO3_Zhou2018 | KNN | KNbO3 | KNbO3 | [11] | eighth_order | K | T |  |
| KNN_K1xNaxNbO3_interpolated | KNN | K1-xNaxNbO3 | 0 <= x <= 0.5 | [10],[11],[12] | eighth_order | K | x, endpoint A=K0.5Na0.5NbO3, endpoint B=KNbO3 | For Landau/electrostrictive coefficients, the source table gives linear interpolation: value = 2*x*A + (1-2*x)*B. Elastic compliances are listed separately. |

## 4. Auxiliary definitions

### 4.1 `BTO_Wang2010_modified`

```text
Ts = 160 K
Ssigma = sigma1 + sigma2 + sigma3
alpha1 = 5.0e5*160*(coth(Ts/T)-coth(Ts/390))
alpha11 and alpha12 use factor: (1 + 0.037*Ssigma)
alpha111, alpha112 and alpha123 use factor: (1 + 0.023*Ssigma)
```

### 4.2 `PZT_Haun1989_composition`

```text
epsilon0 = 8.85e-12
T0(x) = 462.63 + 843.4*x - 2105.5*x^2 + 4041.8*x^3 - 3828.3*x^4 + 1337.8*x^5

C_curie(x) = {2.1716/[1+500.05*(x-0.5)^2] + 0.131*x + 2.01}*1e5,   0.0 <= x <= 0.5
C_curie(x) = {2.8339/[1+126.56*(x-0.5)^2] + 1.4132}*1e5,       0.5 <= x <= 1.0

n1(x) = [2.6213 + 0.42743*x - (9.6 + k*x)*exp(-12.6*x)]*1e14/C_curie(x)
where k = 0.012501 in the consolidated table; earlier rendered Table 3 appears to show k = 0.012301.

n2(x) = [0.887 - 0.76973*x + (16.225 - 0.088651*x)*exp(-21.255*x)]*1e15/C_curie(x)
```

### 4.3 `KNN_K1xNaxNbO3_interpolated`

```text
A = K0.5Na0.5NbO3 endpoint
B = KNbO3 endpoint
For Landau and Q coefficients: value(x) = 2*x*A + (1-2*x)*B, 0 <= x <= 0.5
```

## 5. Coefficient records

| set_id | material | composition | order | coefficient_id | unit_reported | value_expression | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha1 | V*m*C^-1 | `5.0e5*160*(coth(Ts/T)-coth(Ts/390))` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha11 | V*m^5*C^-3 | `-1.154e8*(1+0.037*(sigma1+sigma2+sigma3))` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha12 | V*m^5*C^-3 | `6.530e8*(1+0.037*(sigma1+sigma2+sigma3))` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha111 | V*m^9*C^-5 | `-2.106e9*(1+0.023*(sigma1+sigma2+sigma3))` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha112 | V*m^9*C^-5 | `4.091e9*(1+0.023*(sigma1+sigma2+sigma3))` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha123 | V*m^9*C^-5 | `-6.688e9*(1+0.023*(sigma1+sigma2+sigma3))` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha1111 | V*m^13*C^-7 | `7.590e10` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha1112 | V*m^13*C^-7 | `-2.193e10` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha1122 | V*m^13*C^-7 | `-2.221e10` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | alpha1123 | V*m^13*C^-7 | `2.416e10` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | Q11 | m^4*C^-2 | `0.11` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | Q12 | m^4*C^-2 | `-0.045` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | Q44 | m^4*C^-2 | `0.029` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | S11 | m^2*N^-1 | `9.07e-12` |  |
| BTO_Wang2010_modified | BaTiO3 | BaTiO3 | eighth_order | S12 | m^2*N^-1 | `-3.183e-12` |  |
| BTO_BellCross_from_Wang2010 | BaTiO3 | BaTiO3 | sixth_order | alpha1 | V*m*C^-1 | `3.34e5*(T-381)` |  |
| BTO_BellCross_from_Wang2010 | BaTiO3 | BaTiO3 | sixth_order | alpha11 | V*m^5*C^-3 | `4.69e6*(T-393)-2.02e8` |  |
| BTO_BellCross_from_Wang2010 | BaTiO3 | BaTiO3 | sixth_order | alpha12 | V*m^5*C^-3 | `3.230e8` |  |
| BTO_BellCross_from_Wang2010 | BaTiO3 | BaTiO3 | sixth_order | alpha111 | V*m^9*C^-5 | `-5.52e7*(T-393)+2.76e9` |  |
| BTO_BellCross_from_Wang2010 | BaTiO3 | BaTiO3 | sixth_order | alpha112 | V*m^9*C^-5 | `4.470e9` |  |
| BTO_BellCross_from_Wang2010 | BaTiO3 | BaTiO3 | sixth_order | alpha123 | V*m^9*C^-5 | `4.910e9` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1 | V*m*C^-1 | `4.124e5*(T-388)` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha11 | V*m^5*C^-3 | `-2.097e8` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha12 | V*m^5*C^-3 | `7.794e8` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha111 | V*m^9*C^-5 | `1.294e9` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha112 | V*m^9*C^-5 | `-1.950e9` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha123 | V*m^9*C^-5 | `-2.500e9` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1111 | V*m^13*C^-7 | `3.863e10` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1112 | V*m^13*C^-7 | `2.529e10` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1122 | V*m^13*C^-7 | `1.637e10` |  |
| BTO_Li_from_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1123 | V*m^13*C^-7 | `1.367e10` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1 | V*m*C^-1 | `3.61e5*(T-391)` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha11 | V*m^5*C^-3 | `-1.83e9+4.0e6*T` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha12 | V*m^5*C^-3 | `-2.24e9+6.7e6*T` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha111 | V*m^9*C^-5 | `1.39e10-3.2e7*T` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha112 | V*m^9*C^-5 | `-2.2e9` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha123 | V*m^9*C^-5 | `5.51e10` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1111 | V*m^13*C^-7 | `4.84e10` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1112 | V*m^13*C^-7 | `2.53e11` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1122 | V*m^13*C^-7 | `2.80e11` |  |
| BTO_Wang2010 | BaTiO3 | BaTiO3 | eighth_order | alpha1123 | V*m^13*C^-7 | `9.35e10` |  |
| PVDFTrFE_70_30_Qiu2011 | P(VDF-TrFE) | 70/30 | sixth_order | alpha1 | V*m*C^-1 | `7.5e7*(T-307)` |  |
| PVDFTrFE_70_30_Qiu2011 | P(VDF-TrFE) | 70/30 | sixth_order | alpha11 | V*m^5*C^-3 | `-1.9e12` |  |
| PVDFTrFE_70_30_Qiu2011 | P(VDF-TrFE) | 70/30 | sixth_order | alpha12 | V*m^5*C^-3 | `-1.9e12` |  |
| PVDFTrFE_70_30_Qiu2011 | P(VDF-TrFE) | 70/30 | sixth_order | alpha111 | V*m^9*C^-5 | `1.9e14` |  |
| PVDFTrFE_70_30_Qiu2011 | P(VDF-TrFE) | 70/30 | sixth_order | alpha112 | V*m^9*C^-5 | `1.9e14` |  |
| PVDFTrFE_70_30_Qiu2011 | P(VDF-TrFE) | 70/30 | sixth_order | alpha123 | V*m^9*C^-5 | `1.9e14` |  |
| PVDFTrFE_70_30_Qiu2011 | P(VDF-TrFE) | 70/30 | sixth_order | Q13 | m^4*C^-2 | `3` |  |
| PVDFTrFE_70_30_Qiu2011 | P(VDF-TrFE) | 70/30 | sixth_order | S11 | m^2*N^-1 | `3.32e-10` |  |
| PVDFTrFE_70_30_Qiu2011 | P(VDF-TrFE) | 70/30 | sixth_order | S12 | m^2*N^-1 | `-1.44e-10` |  |
| PVDFTrFE_65_35_Qiu2011 | P(VDF-TrFE) | 65/35 | sixth_order | alpha1 | V*m*C^-1 | `3.5e7*(T-313)` |  |
| PVDFTrFE_65_35_Qiu2011 | P(VDF-TrFE) | 65/35 | sixth_order | alpha11 | V*m^5*C^-3 | `-1.5e12` |  |
| PVDFTrFE_65_35_Qiu2011 | P(VDF-TrFE) | 65/35 | sixth_order | alpha12 | V*m^5*C^-3 | `-1.5e12` |  |
| PVDFTrFE_65_35_Qiu2011 | P(VDF-TrFE) | 65/35 | sixth_order | alpha111 | V*m^9*C^-5 | `1.9e14` |  |
| PVDFTrFE_65_35_Qiu2011 | P(VDF-TrFE) | 65/35 | sixth_order | alpha112 | V*m^9*C^-5 | `1.9e14` |  |
| PVDFTrFE_65_35_Qiu2011 | P(VDF-TrFE) | 65/35 | sixth_order | alpha123 | V*m^9*C^-5 | `1.9e14` |  |
| PVDFTrFE_65_35_Qiu2011 | P(VDF-TrFE) | 65/35 | sixth_order | Q13 | m^4*C^-2 | `3` |  |
| PVDFTrFE_65_35_Qiu2011 | P(VDF-TrFE) | 65/35 | sixth_order | S11 | m^2*N^-1 | `3.32e-10` |  |
| PVDFTrFE_65_35_Qiu2011 | P(VDF-TrFE) | 65/35 | sixth_order | S12 | m^2*N^-1 | `-1.44e-10` |  |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | alpha1 | V*m*C^-1 | `(7.5±1.5)e7*(T-(306.7±3))` | uncertainty notation retained; parser must handle ± |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | alpha11 | V*m^5*C^-3 | `(-1.9±0.2)e12` | uncertainty notation retained; parser must handle ± |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | alpha12 | V*m^5*C^-3 | `(-1.9±0.2)e12` | uncertainty notation retained; parser must handle ± |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | alpha111 | V*m^9*C^-5 | `(1.9±0.2)e14` | uncertainty notation retained; parser must handle ± |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | alpha112 | V*m^9*C^-5 | `(1.9±0.2)e14` | uncertainty notation retained; parser must handle ± |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | alpha123 | V*m^9*C^-5 | `(1.9±0.2)e14` | uncertainty notation retained; parser must handle ± |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | Q11 | m^4*C^-2 | `-12` |  |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | Q12 | m^4*C^-2 | `3` |  |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | S11 | m^2*N^-1 | `3.32e-10` |  |
| PVDFTrFE_70_30_Bai2019 | P(VDF-TrFE) | 70/30 | sixth_order | S12 | m^2*N^-1 | `-1.44e-10` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | alpha1 | V*m*C^-1 | `3.5e7*(T-313)` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | alpha11 | V*m^5*C^-3 | `-1.5e12` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | alpha12 | V*m^5*C^-3 | `-1.5e12` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | alpha111 | V*m^9*C^-5 | `1.9e14` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | alpha112 | V*m^9*C^-5 | `1.9e14` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | alpha123 | V*m^9*C^-5 | `1.9e14` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | Q11 | m^4*C^-2 | `-12` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | Q12 | m^4*C^-2 | `3` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | S11 | m^2*N^-1 | `3.32e-10` |  |
| PVDFTrFE_65_35_Bai2019 | P(VDF-TrFE) | 65/35 | sixth_order | S12 | m^2*N^-1 | `-1.44e-10` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | alpha1 | V*m*C^-1 | `(2.295*T-935.9)*1e5` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | alpha11 | V*m^5*C^-3 | `(-0.3775*T+457.7)*1e5` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | alpha12 | V*m^5*C^-3 | `6.075e7` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | alpha111 | V*m^9*C^-5 | `2.57e9` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | alpha112 | V*m^9*C^-5 | `6.95e9` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | alpha123 | V*m^9*C^-5 | `13.13e9` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | Q11 | m^4*C^-2 | `0.084` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | Q12 | m^4*C^-2 | `-0.025` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | Q44 | m^4*C^-2 | `0.035` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | S11 | m^2*N^-1 | `52e-12` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | S12 | m^2*N^-1 | `-18.9e-12` |  |
| PMNPT_030_Khakpash2015 | PMN-PT | PMN-0.30PT | sixth_order | S44 | m^2*N^-1 | `14e-12` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | alpha1 | V*m*C^-1 | `(2.583*T-1204)*1e5` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | alpha11 | V*m^5*C^-3 | `(-0.3775*T+304.2)*1e5` | source table had missing opening parenthesis; expression normalized by symmetry |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | alpha12 | V*m^5*C^-3 | `10.85e7` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | alpha111 | V*m^9*C^-5 | `2.57e9` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | alpha112 | V*m^9*C^-5 | `6.95e9` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | alpha123 | V*m^9*C^-5 | `13.13e9` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | Q11 | m^4*C^-2 | `0.084` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | Q12 | m^4*C^-2 | `-0.025` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | Q44 | m^4*C^-2 | `0.035` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | S11 | m^2*N^-1 | `9.43e-12` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | S12 | m^2*N^-1 | `-1.68e-12` |  |
| PMNPT_042_Khakpash2015 | PMN-PT | PMN-0.42PT | sixth_order | S44 | m^2*N^-1 | `35.09e-12` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | alpha1 | V*m*C^-1 | `(3.255*T-1960)*1e5` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | alpha11 | V*m^5*C^-3 | `(-0.3775*T-53.92)*1e5` | source table had missing opening parenthesis; expression normalized by symmetry |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | alpha12 | V*m^5*C^-3 | `21.98e7` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | alpha111 | V*m^9*C^-5 | `2.57e9` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | alpha112 | V*m^9*C^-5 | `6.95e9` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | alpha123 | V*m^9*C^-5 | `13.13e9` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | Q11 | m^4*C^-2 | `0.084` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | Q12 | m^4*C^-2 | `-0.025` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | Q44 | m^4*C^-2 | `0.035` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | S11 | m^2*N^-1 | `11e-12` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | S12 | m^2*N^-1 | `-4.1e-12` |  |
| PMNPT_070_Khakpash2015 | PMN-PT | PMN-0.70PT | sixth_order | S44 | m^2*N^-1 | `27.5e-12` |  |
| BFO_Zhang2008_fourth | BiFeO3 | BiFeO3 | fourth_order | alpha1 | 10^5 C^-2*m^2*N | `4.9*(T-1103)` | value uses scale embedded in unit label where applicable |
| BFO_Zhang2008_fourth | BiFeO3 | BiFeO3 | fourth_order | alpha11 | 10^9 C^-4*m^6*N | `6.5` | value uses scale embedded in unit label where applicable |
| BFO_Zhang2008_fourth | BiFeO3 | BiFeO3 | fourth_order | alpha12 | 10^9 C^-4*m^6*N | `1.0` | value uses scale embedded in unit label where applicable |
| BFO_Zhang2008_fourth | BiFeO3 | BiFeO3 | fourth_order | Q11 | 10^-2 C^-2*m^4 | `3.2` | value uses scale embedded in unit label where applicable |
| BFO_Zhang2008_fourth | BiFeO3 | BiFeO3 | fourth_order | Q12 | 10^-2 C^-2*m^4 | `-1.6` | value uses scale embedded in unit label where applicable |
| BFO_Zhang2008_fourth | BiFeO3 | BiFeO3 | fourth_order | Q44 | 10^-2 C^-2*m^4 | `2.0` | value uses scale embedded in unit label where applicable |
| BFO_Zhang2008_fourth | BiFeO3 | BiFeO3 | fourth_order | C11 | GPa | `302` | value uses scale embedded in unit label where applicable |
| BFO_Zhang2008_fourth | BiFeO3 | BiFeO3 | fourth_order | C12 | GPa | `162` | value uses scale embedded in unit label where applicable |
| BFO_Zhang2008_fourth | BiFeO3 | BiFeO3 | fourth_order | C44 | GPa | `68` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | alpha1 | 10^5 C^-2*m^2*N | `4.64385*(T-1103)` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | alpha11 | 10^9 C^-4*m^6*N | `2.29047` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | alpha12 | 10^9 C^-4*m^6*N | `3.06361` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | alpha111 | 10^9 C^-6*m^10*N | `5.99186` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | alpha112 | 10^8 C^-6*m^10*N | `-3.33980` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | alpha123 | 10^9 C^-6*m^10*N | `-1.77754` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | Q11 | 10^-2 C^-2*m^4 | `3.2` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | Q12 | 10^-2 C^-2*m^4 | `-1.6` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | Q44 | 10^-2 C^-2*m^4 | `2.0` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | C11 | GPa | `302` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | C12 | GPa | `162` | value uses scale embedded in unit label where applicable |
| BFO_Hsieh2016_sixth | BiFeO3 | BiFeO3 | sixth_order | C44 | GPa | `68` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha1 | 10^5 C^-2*m^2*N | `4.15144*(T-1103)` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha11 | 10^9 C^-4*m^6*N | `2.127` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha12 | 10^9 C^-4*m^6*N | `-2.049` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha111 | 10^9 C^-6*m^10*N | `-1.760` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha112 | 10^8 C^-6*m^10*N | `8.298` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha123 | 10^9 C^-6*m^10*N | `1.679` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha1111 | 10^8 C^-8*m^14*N | `3.92` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha1112 | 10^7 C^-8*m^14*N | `4.4` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha1122 | 10^8 C^-8*m^14*N | `-3.8` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | alpha1123 | 10^8 C^-8*m^14*N | `8.0` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | Q11 | 10^-2 C^-2*m^4 | `7.2` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | Q12 | 10^-2 C^-2*m^4 | `-3.0` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | Q44 | 10^-2 C^-2*m^4 | `2.015` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | C11 | GPa | `228` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | C12 | GPa | `128` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | C44 | GPa | `65` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | S11 | 10^-12 m^2*N^-1 | `7.36` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | S12 | 10^-12 m^2*N^-1 | `-2.65` | value uses scale embedded in unit label where applicable |
| BFO_Cao2018_eighth | BiFeO3 | BiFeO3 | eighth_order | S44 | 10^-12 m^2*N^-1 | `15.4` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | alpha1 | 10^5 C^-2*m^2*N | `3.8*(T-752)` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | alpha11 | 10^8 C^-4*m^6*N | `-0.73` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | alpha12 | 10^8 C^-4*m^6*N | `7.5` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | alpha111 | 10^8 C^-6*m^10*N | `2.6` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | alpha112 | 10^7 C^-6*m^10*N | `6.1` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | alpha123 | 10^9 C^-6*m^10*N | `-3.7` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | Q11 | 10^-2 C^-2*m^4 | `8.9` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | Q12 | 10^-2 C^-2*m^4 | `-2.6` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | Q44 | 10^-2 C^-2*m^4 | `6.75` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | S11 | 10^-12 m^2/N | `8.0` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | S12 | 10^-12 m^2/N | `-2.5` | value uses scale embedded in unit label where applicable |
| PZT_PbTiO3_Li2005 | PbTiO3 | PbTiO3 | sixth_order | S44 | 10^-12 m^2/N | `9.0` | value uses scale embedded in unit label where applicable |
| PZT_Haun1989_composition | PbZr1-xTixO3 | 0 <= x <= 1 | sixth_order | alpha1 | C^-2*m^2*N | `(T-T0(x))/(2*epsilon0*C_curie(x))` | T in degree_C; see auxiliary definitions |
| PZT_Haun1989_composition | PbZr1-xTixO3 | 0 <= x <= 1 | sixth_order | alpha11 | C^-4*m^6*N | `(10.612-22.655*x+10.955*x^2)*1e13/C_curie(x)` | T in degree_C; see auxiliary definitions |
| PZT_Haun1989_composition | PbZr1-xTixO3 | 0 <= x <= 1 | sixth_order | alpha12 | C^-4*m^6*N | `n1(x)/3-alpha11` | T in degree_C; see auxiliary definitions |
| PZT_Haun1989_composition | PbZr1-xTixO3 | 0 <= x <= 1 | sixth_order | alpha111 | C^-6*m^10*N | `(12.026-17.296*x+9.179*x^2)*1e13/C_curie(x)` | T in degree_C; see auxiliary definitions |
| PZT_Haun1989_composition | PbZr1-xTixO3 | 0 <= x <= 1 | sixth_order | alpha112 | C^-6*m^10*N | `(4.2904-3.3754*x+58.804*exp(-29.387*x))*1e14/C_curie(x)` | T in degree_C; see auxiliary definitions |
| PZT_Haun1989_composition | PbZr1-xTixO3 | 0 <= x <= 1 | sixth_order | alpha123 | C^-6*m^10*N | `n2(x)-3*alpha111-6*alpha112` | T in degree_C; see auxiliary definitions |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha1 | C^-2*m^2*N | `4.29e7*(coth(140/T)-coth(140/657))` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha11 | C^-4*m^6*N | `-2.7302e8` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha12 | C^-4*m^6*N | `1.0861e9` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha111 | C^-6*m^10*N | `3.0448e9` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha112 | C^-6*m^10*N | `-2.727e9` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha123 | C^-6*m^10*N | `1.5513e10` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha1111 | C^-8*m^14*N | `2.4044e10` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha1112 | C^-8*m^14*N | `3.7328e9` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha1122 | C^-8*m^14*N | `3.3485e10` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | alpha1123 | C^-8*m^14*N | `-6.2017e10` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | Q11 | C^-2*m^4*N | `0.16` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | Q12 | C^-2*m^4*N | `-0.072` |  |
| KNN_K05Na05NbO3_Pohlmann2017 | K0.5Na0.5NbO3 | K0.5Na0.5NbO3 | eighth_order | Q44 | C^-2*m^4*N | `0.084` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha1 | C^-2*m^2*N | `4.273e5*140*(coth(140/T)-coth(140/650))` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha11 | C^-4*m^6*N | `-6.36e8` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha12 | C^-4*m^6*N | `9.66e8` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha111 | C^-6*m^10*N | `2.81e9` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha112 | C^-6*m^10*N | `-1.99e9` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha123 | C^-6*m^10*N | `4.5e9` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha1111 | C^-8*m^14*N | `1.74e10` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha1112 | C^-8*m^14*N | `5.99e9` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha1122 | C^-8*m^14*N | `2.5e10` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | alpha1123 | C^-8*m^14*N | `-1.17e10` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | Q11 | C^-2*m^4*N | `0.12` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | Q12 | C^-2*m^4*N | `-0.053` |  |
| KNN_KNbO3_Zhou2018 | KNbO3 | KNbO3 | eighth_order | Q44 | C^-2*m^4*N | `0.052` |  |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha1 | C^-2*m^2*N | `2*x*a1A+(1-2*x)*a1B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha11 | C^-4*m^6*N | `2*x*a11A+(1-2*x)*a11B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha12 | C^-4*m^6*N | `2*x*a12A+(1-2*x)*a12B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha111 | C^-6*m^10*N | `2*x*a111A+(1-2*x)*a111B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha112 | C^-6*m^10*N | `2*x*a112A+(1-2*x)*a112B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha123 | C^-6*m^10*N | `2*x*a123A+(1-2*x)*a123B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha1111 | C^-8*m^14*N | `2*x*a1111A+(1-2*x)*a1111B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha1112 | C^-8*m^14*N | `2*x*a1112A+(1-2*x)*a1112B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha1122 | C^-8*m^14*N | `2*x*a1122A+(1-2*x)*a1122B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | alpha1123 | C^-8*m^14*N | `2*x*a1123A+(1-2*x)*a1123B` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | Q11 | C^-2*m^4*N | `2*x*0.16+(1-2*x)*0.12` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | Q12 | C^-2*m^4*N | `2*x*(-0.072)+(1-2*x)*(-0.053)` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | Q44 | C^-2*m^4*N | `2*x*0.084+(1-2*x)*0.052` | A=K0.5Na0.5NbO3, B=KNbO3 |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | S11 | m^2/N | `5.57e-12` | elastic compliances listed only for composition-dependent row |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | S12 | m^2/N | `-1.57e-12` | elastic compliances listed only for composition-dependent row |
| KNN_K1xNaxNbO3_interpolated | K1-xNaxNbO3 | 0 <= x <= 0.5 | eighth_order | S44 | m^2/N | `13.1e-12` | elastic compliances listed only for composition-dependent row |

## 6. Reference list

- [1] J. J. Wang, P. P. Wu, X. Q. Ma, et al. Temperature-pressure phase diagram and ferroelectric properties of BaTiO3 single crystal based on a modified Landau potential. Journal of Applied Physics, 2010, 108, 114105.
- [2] J. H. Qiu, J. N. Ding, N. Y. Yuan, et al. Effect of misfit strain on the electrocaloric effect of P(VDF-TrFE) copolymer thin films. European Physical Journal B: Condensed Matter and Complex Systems, 2011, 84, 25-28.
- [3] Gang Bai, Duansheng Liu, Cunfa Gao. Phenomenological analysis of elastocaloric effect in ferroelectric poly(vinylidene fluoride-trifluoroethylene) copolymers. Journal of Applied Physics, 2019, 126, 164105.
- [4] N. Khakpash, H. Khassaf, G. A. Rossetti, et al. Misfit strain phase diagrams of epitaxial PMN-PT films. Applied Physics Letters, 2015, 106, 082905.
- [5] Zhang J. X., Li Y. L., Choudhury S., et al. Computer simulation of ferroelectric domain structures in epitaxial BiFeO3 thin films. Journal of Applied Physics, 2008, 103(9), 094111.
- [6] Hsieh, Ying-Hui, et al. Permanent ferroelectric retention of BiFeO3 mesocrystal. Nature Communications, 2016, 7, 1-9.
- [7] Cao Y., Li Q., Huijben M., et al. Electronic switching by metastable polarization states in BiFeO3 thin films. Physical Review Materials, 2018, 2(9), 094401.
- [8] Li Y. L., Hu S. Y., Chen L. Q. Ferroelectric domain morphologies of (001) PbZr1-xTixO3 epitaxial thin films. Journal of Applied Physics, 2005, 97(3), 034112.
- [9] M. J. Haun, E. Furman, S. J. Jang, L. E. Cross. Ferroelectrics, 1989, 99(1), 13-25.
- [10] Pohlmann H., Wang J. J., Wang B., et al. A thermodynamic potential and the temperature-composition phase diagram for single-crystalline K1-xNaxNbO3 (0 <= x <= 0.5). Applied Physics Letters, 2017, 110(10), 102906.
- [11] Zhou M. J., Wang J. J., Chen L. Q., et al. Strain, temperature, and electric-field effects on the phase transition and piezoelectric responses of K0.5Na0.5NbO3 thin films. Journal of Applied Physics, 2018, 123(15), 154106.
- [12] Tomeno I., Tsunoda Y., Oka K., et al. Lattice dynamics of cubic NaNbO3: an inelastic neutron scattering study. Physical Review B, 2009, 80(10), 104101.

## 7. Data-quality notes for later database construction

- The first part of the Word document contains shorter BFO, PbTiO3/PZT, and KNN tables that duplicate the later consolidated tables. This Markdown uses the later consolidated material tables as the primary source, except where the earlier rendered PZT formula clarifies SI units and auxiliary definitions.
- BTO modified Wang terms contained embedded equation images in Word. These were transcribed from the rendered document into text expressions.
- PZT Haun formulas should be checked before numerical deployment because the source document contains a small inconsistency in the `n1(x)` coefficient: `0.012301*x` in the earlier rendered formula image versus `0.012501*x` in the later consolidated table.
- PMN-PT `alpha11` rows for PMN-0.42PT and PMN-0.70PT had missing opening parentheses in the Word table; this Markdown normalizes them by analogy with the PMN-0.30PT row.