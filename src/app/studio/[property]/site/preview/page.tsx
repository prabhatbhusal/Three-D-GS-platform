'use client';

import { use, useEffect, useState } from 'react';
import { getSitePreview, type PublicSite } from '../../../../../lib/api';
import { useStudioSession } from '../../../../../lib/useStudioSession';
import { SiteView } from '../../../../s/[property]/SiteView';

/**
 * The website editor's Preview (/studio/<project>/site/preview): the saved
 * draft, drawn by the same SiteView as the public page, so what you see is
 * what visitors will get after Publish. Enquiries and bookings wait for it.
 */
export default function SitePreviewPage({ params }: { params: Promise<{ property: string }> }) {
  const { property: id } = use(params);
  const ok = useStudioSession(`/studio/${id}/site/preview`);
  const [data, setData] = useState<PublicSite | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ok) return;
    getSitePreview(id).then(setData).catch((e: Error) => setError(e.message));
  }, [ok, id]);

  if (error) return <p style={{ padding: 24, font: '16px system-ui' }}>{error}</p>;
  if (!data) return <p style={{ padding: 24, font: '16px system-ui' }}>Loading the preview…</p>;
  return <SiteView data={data} preview />;
}
