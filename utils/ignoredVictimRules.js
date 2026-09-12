const ignoredVictimRules = [
    { type: 'substring', value: 'yormandi' },
    { type: 'substring', value: 'kopion' },
    { type: 'substring', value: 'marok' },
    { type: 'substring', value: 'PU_Human' },
    { type: 'substring', value: 'PU-Human' },
    { type: 'substring', value: 'PC_Archetypes' },
    { type: 'substring', value: 'PU_Pilots' },
    { type: 'startsWith', value: 'quasigrazer' },
    { type: 'startsWith', value: 'shipjacker' },
    { type: 'startsWith', value: 'argo_atls' },
    { type: 'regex', value: '^vlk(?!_apex_)' }
];
module.exports = { ignoredVictimRules };
