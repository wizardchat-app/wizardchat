import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileTextIcon } from '@phosphor-icons/react';
import { Modal } from '@/app/components/Modal';
import { markdownToHtml } from '@/util/markdownToHtml';
import { formatFileSize } from '@/util/format';
import * as css from './FilePreview.css';

export type PreviewKind = 'text' | 'markdown' | 'pdf';

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set(
  (
    'txt log csv tsv json jsonc xml yaml yml toml ini cfg conf env sql sh bash zsh ' +
    'ps1 bat js mjs cjs ts tsx jsx css scss html htm py rb rs go java kt kts swift ' +
    'c h cpp hpp cs php lua diff patch srt vtt gradle properties'
  ).split(' ')
);

const TEXT_MIMETYPES = new Set([
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/x-sh',
  'application/javascript',
  'application/sql',
]);

export function previewKind(filename: string, mimetype?: string | null): PreviewKind | null {
  const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  const type = (mimetype ?? '').toLowerCase().split(';')[0].trim();
  if (type === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (
    type === 'text/markdown' ||
    type === 'text/x-markdown' ||
    ['md', 'markdown'].includes(extension)
  ) {
    return 'markdown';
  }
  if (type.startsWith('text/') || TEXT_MIMETYPES.has(type) || TEXT_EXTENSIONS.has(extension)) {
    return 'text';
  }
  return null;
}

type State =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'text'; text: string; truncated: boolean }
  | { status: 'pdf'; url: string };

interface FilePreviewModalProps {
  src: string;
  filename: string;
  kind: PreviewKind;
  onClose: () => void;
}

export function FilePreviewModal({ src, filename, kind, onClose }: FilePreviewModalProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let pdfUrl: string | null = null;
    setState({ status: 'loading' });
    (async () => {
      const blob = await (await fetch(src)).blob();
      if (kind === 'pdf') {
        pdfUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (!cancelled) setState({ status: 'pdf', url: pdfUrl });
        return;
      }
      const text = await blob.slice(0, MAX_TEXT_BYTES).text();
      if (!cancelled) setState({ status: 'text', text, truncated: blob.size > MAX_TEXT_BYTES });
    })().catch(() => {
      if (!cancelled) setState({ status: 'failed' });
    });
    return () => {
      cancelled = true;
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [src, kind]);

  const markdownHtml = useMemo(
    () =>
      kind === 'markdown' && state.status === 'text'
        ? markdownToHtml(state.text, undefined, false)
        : '',
    [kind, state]
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={filename}
      titleIcon={<FileTextIcon size={18} />}
      size="xxl"
    >
      <div className={css.body}>
        {state.status === 'loading' && <p className={css.status}>{t('common.loading')}</p>}
        {state.status === 'failed' && <p className={css.status}>{t('timeline.previewFailed')}</p>}
        {state.status === 'pdf' && <iframe className={css.pdf} src={state.url} title={filename} />}
        {state.status === 'text' &&
          (kind === 'markdown' ? (
            <div className={css.markdown} dangerouslySetInnerHTML={{ __html: markdownHtml }} />
          ) : (
            <pre className={css.text}>{state.text}</pre>
          ))}
        {state.status === 'text' && state.truncated && (
          <p className={css.status}>
            {t('timeline.previewTruncated', { size: formatFileSize(MAX_TEXT_BYTES) })}
          </p>
        )}
      </div>
    </Modal>
  );
}
