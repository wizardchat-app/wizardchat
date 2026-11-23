import * as css from './Timeline.css';

export function SkeletonRow({
  width1 = '60%',
  width2 = '40%',
}: {
  width1?: string;
  width2?: string;
}) {
  return (
    <div className={css.skeletonRow}>
      <div className={css.skeletonAvatar} />
      <div className={css.skeletonLines}>
        <div className={css.skeletonLine} style={{ width: width1 }} />
        <div className={css.skeletonLine} style={{ width: width2 }} />
      </div>
    </div>
  );
}
