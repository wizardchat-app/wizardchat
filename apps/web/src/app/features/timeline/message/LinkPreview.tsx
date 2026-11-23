import type { WizardClient } from '@wizardchat/core';
import { useLinkPreview } from '@/app/hooks/useLinkPreview';
import { useMediaBlobUrl } from '@/app/components/Avatar';
import { Tooltip } from '@/app/components/Tooltip';
import * as css from './LinkPreview.css';

interface LinkPreviewProps {
  url: string;
  client: WizardClient;
  isEncrypted: boolean;
}

export function LinkPreview({ url, client, isEncrypted }: LinkPreviewProps) {
  const { data } = useLinkPreview(client, url, isEncrypted);
  const ogImage = data?.imageUrl?.startsWith('mxc://') ? data.imageUrl : null;
  const { src: imgSrc, failed: imgFailed, refetch } = useMediaBlobUrl(client, ogImage);

  if (!data) return null;

  const title = data.title;
  if (!title) return null;

  const description = data.description;
  const ogUrl = data.url || url;

  let siteName: string | null = null;
  try {
    const hostname = new URL(ogUrl).hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    siteName = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  } catch {
    // ignore
  }

  return (
    <div className={css.card}>
      {ogImage &&
        !imgFailed &&
        (imgSrc ? (
          <img src={imgSrc} alt="" className={css.image} onError={refetch} />
        ) : (
          <div className={css.imagePlaceholder} />
        ))}
      <div className={css.body}>
        <Tooltip content={url} placement="top">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={css.title}
            onClick={(e) => e.stopPropagation()}
          >
            {title}
          </a>
        </Tooltip>
        {description && <span className={css.description}>{description}</span>}
        {siteName && <span className={css.siteName}>{siteName}</span>}
      </div>
    </div>
  );
}
