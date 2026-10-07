/** The explainer page (/gaussian-splatting, 2026-10-06), written answer-first
 *  for search and answer engines: the definition in the first lines, then a
 *  comparison, a glossary and the questions people ask. Also read by
 *  /llms.txt and /llms-full.txt and marked up as FAQPage / DefinedTermSet.
 *  General facts only (the 2023 paper, how the formats differ); the numbers
 *  we quote about our own scanner are the ones already on the other pages. */
export const GUIDE = {
  path: '/gaussian-splatting',
  title: 'What is a 3D Gaussian splat tour?',
  /** the whole answer, in under 60 words */
  /** about 150 characters, for the page's meta description */
  short: 'A 3D Gaussian splat tour is a walkable, photographic copy of a real place that opens in a browser, with no app. How it works and how it compares.',
  answer: 'A 3D Gaussian splat tour is a walkable, photographic copy of a real place. The space is scanned, then rebuilt as millions of tiny soft-edged coloured blobs, called Gaussians, which a web browser draws in real time. Visitors move freely through it on a phone or computer, with no app to install.',
  published: '2026-10-06',
  modified: '2026-10-06',
  compare: {
    head: ['', '360° photo tour', 'Photogrammetry mesh', 'Gaussian splat tour'],
    rows: [
      ['How you move', 'Jump between fixed points', 'Anywhere', 'Anywhere: walk, fly or orbit'],
      ['How it looks', 'Sharp but flat', 'Textured polygons, can look waxy', 'Photographic, keeps fine detail such as carvings and foliage'],
      ['Thin and fine things', 'Fine, but only from the photo’s point of view', 'Often lost or smeared', 'Handled well'],
      ['Measurable', 'No', 'Only if scanned for it', 'Yes, when it starts from a LiDAR scan'],
      ['Weight on the web', 'Light', 'Heavy with textures', 'Large, so it streams by level of detail']
    ]
  },
  terms: [
    ['Gaussian splat', 'One soft, semi-transparent, coloured ellipse in 3D space. A scene is millions of them drawn together, instead of triangles.'],
    ['LiDAR', 'A scanner that measures distance with laser pulses, so it records the true shape of a space. A handheld one captures it as you walk.'],
    ['Point cloud', 'The raw result of a scan: millions of measured points, each with a position and a colour.'],
    ['Level of detail (LOD)', 'Keeping several resolutions of the same scan and loading the one that suits how near the camera is, so a large scan opens fast.'],
    ['LCC', 'Lixel CyberColor, the XGRIDS format that stores a splat scan in tiles that stream by level of detail. It is what our tours are made from.']
  ] as [string, string][],
  faq: [
    {
      q: 'What does “Gaussian splatting” mean?',
      a: 'It is a way of showing a 3D scene as many soft, semi-transparent, coloured ellipsoids (Gaussians) instead of triangles. The method for drawing them in real time was published in 2023 by researchers at Inria in the paper “3D Gaussian Splatting for Real-Time Radiance Field Rendering”.'
    },
    {
      q: 'How is it different from a 360° virtual tour?',
      a: 'A 360° tour is a set of panoramic photos you jump between, so you can only look around from the places the photographer stood. A splat tour is a 3D copy of the whole space, so visitors choose their own path and viewpoint.'
    },
    {
      q: 'How is it different from photogrammetry or a 3D mesh?',
      a: 'A mesh is built from triangles with photos painted on, which can look waxy and loses thin things such as railings, leaves and lattice. A splat keeps the photographic look of the capture and handles those fine details better.'
    },
    {
      q: 'Does it work on a phone?',
      a: 'Yes. The tour runs in the phone’s browser from one link. It streams only what the camera sees and lowers its quality automatically on a slower device, so it keeps moving.'
    },
    {
      q: 'Why does a large scan still open quickly?',
      a: 'We never shrink the scan. The tour keeps it at full quality and loads it in tiles by level of detail, so what is near the camera arrives first and the rest follows.'
    },
    {
      q: 'Can I get measurements or a floor plan from it?',
      a: 'Yes, because our tours start from a LiDAR scan, not photos alone. The same capture also gives point clouds, floor plans, elevations and sections.'
    },
    {
      q: 'Who makes Gaussian splat tours in Nepal?',
      a: 'RCAAS.tech, in Kathmandu, an authorised XGRIDS partner. We scan the space on site, build the tour, host it and give you a link and an embed code for your website.'
    }
  ]
};
