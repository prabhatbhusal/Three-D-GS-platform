/** "How a scan becomes a tour": a pinned scene, one screen of scroll per
 *  caption. It flies through the frames in public/media/sequence (or, without
 *  those, the tour photos in public/media/tour); with neither it shows nothing. */
import { Fragment } from 'react';
import { FlyThrough, FrameScrub } from '../SiteMotion';
import { frames } from '../media';

const SCAN = [
  { t: 'Walk it once', b: 'A handheld LiDAR scanner records 200,000 points a second as we walk through.' },
  { t: 'Every surface, in colour', b: 'Processing turns the scan into a photographic Gaussian splat, at full fidelity.' },
  { t: 'Open it anywhere', b: 'One link. It streams to an ordinary phone, with no app and no plugin.' },
  { t: 'Ask without leaving', b: 'An enquiry form inside the room, so a visitor who is looking can ask.' }
];

export function ScanStory() {
  const flight = frames('sequence');
  const tour = frames('tour');
  const captions = SCAN.map((c) => (
    <Fragment key={c.t}>
      <h2>{c.t}</h2>
      <p>{c.b}</p>
    </Fragment>
  ));
  if (flight.length > 1) return <FrameScrub frames={flight} label="How a scan becomes a tour" captions={captions} />;
  return tour.length > 1 ? <FlyThrough images={tour} label="How a scan becomes a tour" captions={captions} /> : null;
}
