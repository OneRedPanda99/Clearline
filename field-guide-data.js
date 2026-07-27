/**
 * Clearline field guide — surface data.
 *
 * DESIGN RULE: a method that can seriously damage a surface is not present
 * in this data at all. The UI renders whatever methods exist here, so
 * "never pressure wash vinyl siding" is enforced by the absence of a
 * `pressure` key, not by a warning the crew can tap past.
 *
 * Ratio classes carry the SH percentage and dwell time together so a
 * surface screen never has to cross-reference a table.
 */
window.CL_GUIDE = (function () {

  const RATIOS = {
    light: { sh: '1–2%', dwell: '3–5 min', dwellSec: 180, dwellMaxSec: 300 },
    medium: { sh: '2–4%', dwell: '5–8 min', dwellSec: 300, dwellMaxSec: 480 },
    roof: { sh: '3–6%', dwell: '10–15 min', dwellSec: 600, dwellMaxSec: 900 }
  };

  // The backbone every soft wash job follows. Only the ratio and the dwell
  // time change per surface — the order never does.
  function softSteps(ratio, overrides) {
    const o = overrides || {};
    return [
      o.s1 || 'Water all nearby plants and grass. Do this before any chemical — a dry plant drinks chemical faster than a wet one.',
      o.s2 || 'Move or cover what the chemical should not touch: light fixtures, vehicles, furniture. NEVER cover the A/C unit — shut it off and rinse it instead (see Safety).',
      o.s3 || 'Pre-rinse the surface with plain water to knock off loose dirt.',
      o.s4 || ('Mix chemical to ' + ratio.sh + ' SH. Mix outside in open air, never in an enclosed space.'),
      o.s5 || 'Apply the chemical low to high, so runoff never re-dirties a section you already cleaned.',
      o.s6 || ('Start the dwell timer: ' + ratio.dwell + '. Do not rinse early. Do not let it run long either.'),
      o.s7 || 'Water all nearby plants and grass again. Chemical runoff is on the ground now — flush it.',
      o.s8 || 'Rinse the surface high to low with plain water until runoff runs clear.',
      o.s9 || 'Final rinse on all nearby plants and grass. Walk the perimeter and check nothing is pooling.'
    ];
  }

  const PRECHECK = {
    testSpot: {
      title: 'Test spot required',
      body: 'Pick an out-of-sight corner and run your normal pressure for about 3 seconds. If the surface etches, pits, or the top layer lifts — stop. Drop to soft wash, or lower the pressure and widen the tip, then re-test.'
    },
    woodId: {
      title: 'Identify the wood first',
      body: 'Press your fingernail hard into a crisp edge. Leaves a dent = softwood (500–800 PSI max). Barely marks it = hardwood (up to 1,200 PSI). Pressure-treated is usually treated softwood — do not assume it takes more. Not sure? Treat it as softwood.'
    },
    rot: {
      title: 'Check for rot first',
      body: 'Walk it and feel for spots that give or feel spongy. Look for dark patches, cracking, crumbling, musty smell or fungus. Press a screwdriver into anything suspicious — if it sinks in or crumbles instead of splintering, that section is rotted. Soft wash only, and flag it.'
    }
  };

  // Shown on the method screen so the crew picks on evidence, not vibes.
  const HOUSE_RINSE = 'Rinse every window on the wall you just washed. Chemical left to dry on glass spots it and we end up cleaning them twice.';

  const SOFT_WHEN = 'Lighter dirt and organic growth — mildew, algae, green film.';
  const PRESSURE_WHEN = 'Caked-on dirt and less organic buildup. Still cleans organic growth too.';

  const soft = (ratio, extra) => Object.assign({
    id: 'soft',
    label: 'Soft Wash',
    icon: 'fa-spray-can-sparkles',
    when: SOFT_WHEN,
    ratio: ratio,
    steps: softSteps(ratio, (extra || {}).overrides)
  }, extra || {});

  const MATERIALS = [
    {
      id: 'concrete', label: 'Concrete', icon: 'fa-road',
      surfaces: ['Driveway', 'Sidewalk', 'Patio', 'Pool Deck', 'Garage Floor'].map(function (name) {
        return {
          label: name,
          img: name === 'Driveway' ? 'concrete-driveway.jpg' : undefined,
          before: 'Confirm with the client: was this poured more than 30 days ago? If it is recent or they are unsure — soft wash only.',
          methods: [
            soft(RATIOS.medium),
            {
              id: 'pressure', label: 'Pressure Wash', icon: 'fa-jet-fighter-up', when: PRESSURE_WHEN,
              prechecks: [PRECHECK.testSpot],
              steps: [
                'Test spot: normal pressure, about 3 seconds, out-of-sight corner. Etching or pitting means the pour is weak no matter how old it is — stop and soft wash instead.',
                'Use the surface cleaner for open flatwork — it cleans evenly and leaves no wand stripes. Wand only for edges, corners and anywhere the surface cleaner will not sit flat.',
                'Set the pressure at the machine, not by choking the trigger. Turn it down for older or softer concrete.',
                'Pressure wash low to high. With the wand, use a wide fan tip and keep it moving — never hold it in one spot.',
                'If you soft washed this surface first, rinse the chemical runoff off the grass edges when you finish.'
              ]
            }
          ]
        };
      })
    },
    {
      id: 'brick', label: 'Brick', icon: 'fa-border-all',
      surfaces: [
        {
          label: 'House Siding',
          img: 'brick-siding.jpg',
          warn: 'Never pressure wash brick on a house wall.',
          methods: [soft(RATIOS.medium)]
        },
        {
          label: 'Walkway / Patio',
          methods: [soft(RATIOS.medium), brickPressure()]
        },
        {
          label: 'Retaining Wall',
          methods: [soft(RATIOS.medium), brickPressure()]
        },
        {
          label: 'Chimney',
          warn: 'Never pressure wash a chimney.',
          methods: [soft(RATIOS.medium)]
        }
      ]
    },
    {
      id: 'vinyl', label: 'Vinyl', icon: 'fa-grip-lines',
      surfaces: [
        {
          label: 'House Siding',
          img: 'vinyl-siding.jpg',
          warn: 'Never pressure wash vinyl siding. Pressure forces water behind the panels and can blow them off the wall.',
          methods: [soft(RATIOS.light, {
            overrides: {
              s8: 'Rinse high to low, keeping the wand 3+ feet off the surface even on soft wash. Held close, soft wash pressure still drives water behind panels.',
              s9: 'Final rinse on plants and grass. ' + HOUSE_RINSE
            }
          })]
        },
        {
          label: 'Fence',
          methods: [
            soft(RATIOS.light),
            {
              id: 'pressure', label: 'Pressure Wash', icon: 'fa-jet-fighter-up', when: PRESSURE_WHEN,
              prechecks: [PRECHECK.testSpot],
              steps: [
                'Test spot on a corner post.',
                'Low pressure only, wide fan tip, wand moving continuously.',
                'If chemical went on this surface, rinse the runoff off the grass.'
              ]
            }
          ]
        },
        {
          label: 'Shutters',
          warn: 'Never pressure wash shutters — they come off the wall.',
          methods: [soft(RATIOS.light)]
        }
      ]
    },
    {
      id: 'wood', label: 'Wood', icon: 'fa-tree',
      surfaces: [
        { label: 'Deck', methods: [soft(RATIOS.light), woodPressure()] },
        { label: 'Fence', methods: [soft(RATIOS.light), woodPressure()] },
        {
          label: 'House Siding',
          img: 'wood-siding.jpg',
          warn: 'Wood siding on a wall gets the same rule as vinyl and stucco. Never pressure wash it.',
          methods: [soft(RATIOS.light)]
        },
        { label: 'Pergola', methods: [soft(RATIOS.light), woodPressure()] }
      ]
    },
    {
      id: 'stucco', label: 'Stucco', icon: 'fa-square',
      surfaces: ['House Siding', 'Retaining Wall'].map(function (name) {
        return {
          label: name,
          img: name === 'House Siding' ? 'stucco-siding.jpg' : undefined,
          warn: 'Never pressure wash stucco. It is porous — pressure drives water into the wall.',
          methods: [soft(RATIOS.medium, {
            overrides: {
              s8: 'Rinse high to low and keep the wand moving. Do not linger in one spot even at soft wash pressure — standing pressure drives water into the wall.',
              s9: 'Final rinse on plants and grass. ' + HOUSE_RINSE
            }
          })]
        };
      })
    },
    {
      id: 'metal', label: 'Metal / Aluminum', icon: 'fa-industry',
      surfaces: ['Siding', 'Gutters', 'Awnings', 'Railings'].map(function (name) {
        return {
          label: name,
          methods: [
            soft(RATIOS.light),
            {
              id: 'pressure', label: 'Pressure Wash', icon: 'fa-jet-fighter-up', when: PRESSURE_WHEN,
              prechecks: [PRECHECK.testSpot],
              steps: [
                'Test spot on a low-visibility panel or rail. Watch for denting — thin aluminum dents easily.',
                'Moderate pressure, wide fan tip, wand moving continuously.',
                'If chemical went on this surface, rinse the runoff off the grass.'
              ]
            }
          ]
        };
      })
    },
    {
      id: 'composite', label: 'Composite Decking', icon: 'fa-layer-group',
      surfaces: ['Deck Boards', 'Railings'].map(function (name) {
        return {
          label: name,
          warn: 'Never pressure wash composite. Trex and most manufacturers void the warranty — assume that applies unless the client has written sign-off from the manufacturer.',
          methods: [soft(RATIOS.light)]
        };
      })
    },
    {
      id: 'roof', label: 'Roofing', icon: 'fa-house-chimney',
      surfaces: ['Asphalt Shingle', 'Metal Roof', 'Tile Roof'].map(function (name) {
        return {
          label: name,
          warn: 'Never pressure wash any roof, ever. It strips granules off shingles and voids roofing warranties industry-wide. This is not a judgment call.',
          methods: [soft(RATIOS.roof, {
            overrides: {
              s1: 'Confirm your ladder and harness setup before anything else.',
              s2: 'Water any plants and grass at ground level near the runoff paths.',
              s3: 'Pre-rinse if you can reach it safely.',
              s5: 'Apply low to high, working across the roof section by section.',
              s7: 'Water the plants and grass at ground level again.',
              s9: 'Final rinse on the plants and grass below.'
            }
          })]
        };
      })
    },
    {
      id: 'pavers', label: 'Pavers / Stone', icon: 'fa-th',
      surfaces: ['Driveway', 'Patio', 'Walkway', 'Retaining Wall'].map(function (name) {
        return {
          label: name,
          methods: [
            soft(RATIOS.medium),
            {
              id: 'pressure', label: 'Pressure Wash', icon: 'fa-jet-fighter-up', when: PRESSURE_WHEN,
              steps: [
                'Surface cleaner works well on open paver flats. Wand the edges and joints by hand.',
                'Wide fan tip, moderate pressure — set it at the machine.',
                'Stay off the polymeric sand joints — high pressure blows the sand out and it has to be re-sanded after.',
                'If chemical went on this surface, rinse the runoff off the grass.'
              ]
            }
          ]
        };
      })
    },
    {
      id: 'painted', label: 'Painted Surfaces', icon: 'fa-fill-drip',
      surfaces: ['Trim / Fascia', 'Painted Brick', 'Painted Wood Siding'].map(function (name) {
        return {
          label: name,
          diagram: name === 'Trim / Fascia' ? 'fascia-diagram.png' : undefined,
          warn: 'Never pressure wash anything painted. Pressure strips paint even at moderate settings, whatever is underneath it.',
          methods: [soft(RATIOS.light)]
        };
      })
    },
    {
      id: 'glass', label: 'Glass / Windows', icon: 'fa-window-maximize',
      surfaces: ['Windows', 'Storefront Glass'].map(function (name) {
        return {
          label: name,
          warn: 'Never pressure wash glass. No chemical on wood window frames or seals — chemical on the glass only, plain water on the frames.',
          methods: [{
            id: 'soft', label: 'Water-Fed Pole', icon: 'fa-droplet',
            when: 'The only way we clean glass. No pressure, ever.',
            ratio: null,
            note: 'Pure water only — never tap water. Tap water carries minerals that dry as spots and you will be back doing it again.',
            steps: [
              'Water any nearby plants if chemical is going on the surrounding trim.',
              'Rinse the glass first to float off grit, so the brush is not dragging it across the pane.',
              'Scrub the glass with the brush — work the frame edges and corners where dirt sits.',
              'Work back and forth across the pane until the whole surface has been scrubbed evenly.',
              'Final rinse with pure water, top down. Let it sheet off — do not towel it.',
              'No chemical on wood frames or seals. Chemical belongs on glass only, plain water on the frames.'
            ]
          }]
        };
      })
    },
    {
      id: 'gutters', label: 'Gutters', icon: 'fa-water',
      surfaces: [
        {
          label: 'Exterior Faces',
          methods: [
            soft(RATIOS.medium),
            {
              id: 'pressure', label: 'Pressure Wash', icon: 'fa-jet-fighter-up', when: PRESSURE_WHEN,
              steps: [
                'Moderate pressure, standard fan tip.',
                'If chemical went on this surface, rinse the runoff off the grass.'
              ]
            }
          ]
        },
        {
          label: 'Interior / Downspouts',
          methods: [{
            id: 'flush', label: 'Flush Out', icon: 'fa-droplet',
            ratio: null,
            note: 'Mechanical, not chemical. No dwell step.',
            steps: [
              'Clear debris by hand where you can reach it.',
              'Flush with plain water until it runs clear at the downspout outlet.'
            ]
          }]
        }
      ]
    }
  ];

  function brickPressure() {
    return {
      id: 'pressure', label: 'Pressure Wash', icon: 'fa-jet-fighter-up', when: PRESSURE_WHEN,
      prechecks: [PRECHECK.testSpot],
      steps: [
        'Test spot on the oldest mortar joints you can find. Mortar erodes before the brick face does — that is the weak point.',
        'Pressure wash low to high with a wide fan tip. Do not park the wand on a mortar line.',
        'If chemical went on this surface, rinse the runoff off the grass edges.'
      ]
    };
  }

  function woodPressure() {
    return {
      id: 'pressure', label: 'Pressure Wash', icon: 'fa-jet-fighter-up', when: PRESSURE_WHEN,
      prechecks: [PRECHECK.woodId, PRECHECK.rot],
      steps: [
        'Confirm the wood type with the fingernail test above.',
        'Set pressure: softwood 500–800 PSI max. Hardwood up to 1,200 PSI.',
        'Wide fan tip, 30° or wider. White or green tip only — never red or yellow.',
        'Test spot on an out-of-sight board before doing the whole thing.',
        'Keep the tip at least 8 inches off the surface at all times.',
        'Work with the grain in even strokes. Never let the wand pause in one spot.',
        'Lift the tip 12+ inches away before changing direction, or you leave a visible line in the wood.',
        'If chemical went on this surface, rinse the runoff off nearby plants and grass.'
      ],
      stop: 'If the rot check failed anywhere — soft wash only on that section, and flag it to the client and Parker. It may be a repair job, not a cleaning job.'
    };
  }

  const SAFETY = [
    {
      title: 'PPE — every job, every mix',
      icon: 'fa-helmet-safety',
      body: 'Gloves, mask, goggles, long sleeves, long pants, closed-toe boots. No exposed skin handling or spraying SH. A splash starts burning within seconds.'
    },
    {
      title: 'Never mix SH with anything but water',
      icon: 'fa-skull-crossbones',
      danger: true,
      body: 'Ammonia (some glass and multi-surface cleaners, pet urine) makes chloramine gas. Any acid — vinegar, muriatic, rust remover, concrete etch, toilet cleaner — makes chlorine gas. Rubbing alcohol makes chloroform. Hydrogen peroxide releases oxygen fast enough to be a fire hazard. These reactions take seconds and can be lethal in a closed space.',
      rules: [
        'Only SH, water, and your usual surfactant go in the tank. Nothing else.',
        'Rinse tanks, hoses and downstreamers with plain water before switching chemicals either direction.',
        'If a client already put something on the surface, ask what it was and rinse thoroughly with plain water first. Do not apply on top of an unknown residue.',
        'Never add a bottle you did not mix and cannot identify. Labels are not always accurate.',
        'Strong chemical smell after mixing or applying — stop, back away, get to fresh air. Do not lean in to identify it. Call Parker. If breathing is affected, call 911.',
        'Store SH away from any acid or ammonia product in the truck. A spill in transit can mix them.'
      ]
    },
    {
      title: 'Never cover a running A/C unit',
      icon: 'fa-fan',
      danger: true,
      body: 'Covering a condenser chokes the airflow it needs to dump heat. Run it covered and you can overheat the compressor — an expensive failure we would be paying for. A wrapped unit also traps moisture against the coil and corrodes it.',
      rules: [
        'Shut the unit off at the thermostat or the disconnect before you wash near it. Ask the client first.',
        'Do not wrap or bag it. Rinse the fins with plain water before you start, keep chemical off the coil, and rinse again after.',
        'SH eats aluminum fins. If chemical gets on the coil, flush it right away — do not let it dwell.',
        'Turn it back on when you are done and confirm with the client that it runs.'
      ]
    },
    {
      title: 'Check your connections before you pull the trigger',
      icon: 'fa-link',
      body: 'Walk the line before every job: machine to hose, hose to gun, gun to wand or surface cleaner. A connection that lets go under pressure whips, and a loose fitting on the chemical side sprays SH where you are not looking.'
    },
    {
      title: 'Chemical on skin or in eyes',
      icon: 'fa-kit-medical',
      danger: true,
      body: 'Flush with clean water immediately and keep flushing for a full 15 minutes — longer than feels necessary. Remove any soaked clothing while flushing. For eyes, hold the lids open and flush from the inner corner outward. Call Parker. If burning continues after flushing, or breathing is affected, call 911 or poison control.'
    },
    {
      title: 'Dwell time cuts both ways',
      icon: 'fa-clock',
      body: 'Never let chemical or dirt sit longer than instructed. Chemical left too long etches and discolors. Dirt left too long re-dries and gets harder to lift.'
    },
    {
      title: 'Water the vegetation three times — on chemical jobs',
      icon: 'fa-seedling',
      body: 'Before chemical, right after chemical goes on, and after the final rinse. It is built into every soft wash sequence. A pressure wash is water only, so there is nothing to protect the plants from — no pre-watering needed unless you soft washed the same surface first.'
    },
    {
      title: 'Soft wash is not damage-proof',
      icon: 'fa-hand',
      body: 'Soft wash means low pressure by design, not that it cannot cause damage. Keep your standoff distance on every surface, every time.'
    },
    {
      title: 'Test spot, always',
      icon: 'fa-vial',
      body: 'Anywhere this guide asks for one, do it — even on a surface you have cleaned a hundred times. A weak pour, a soft board, or a degraded chemical batch does not announce itself until the wand is already on it.'
    },
    {
      title: 'Already damaged? Do not pressure wash it',
      icon: 'fa-triangle-exclamation',
      body: 'Rotting or splintering wood, cracked stucco, failing mortar — pressure makes existing damage worse. Soft wash, or call Parker.'
    },
    {
      title: 'Old chemical is weaker chemical',
      icon: 'fa-flask',
      body: 'Fresh 12.5% SH holds usable strength for roughly 30–60 days stored cool and dark, and degrades faster if it has been hot or in the sun. Label containers with the mix date. More than a couple of weeks old — mix toward the higher end of the range and confirm in a test spot. A jug that sat in the truck all summer is not full strength.'
    }
  ];

  const PREJOB = [
    'Check every hose connection: machine to hose, hose to gun, gun to wand or surface cleaner.',
    'Ask the client to shut the A/C off, or shut it off at the disconnect. Never cover it.',
    'Locate the water shutoff.',
    'Identify any septic or well systems nearby.',
    'Note fragile plants and anything that needs covering.',
    'Check the wind direction — chemical drift onto a neighbour\'s car, plants or pool is on us.',
    'Check the chemical mix date on the container.'
  ];

  return { MATERIALS: MATERIALS, SAFETY: SAFETY, PREJOB: PREJOB, RATIOS: RATIOS };
})();
