import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useMediaBlobUrl } from '@/app/components/Avatar/useMediaBlobUrl';

interface BannerState {
  mxc: string | null;
  canModify: boolean;
}

export function useUserBanner(client: MatrixClient | null, userId: string | null) {
  const qc = useQueryClient();

  const { data: banner } = useQuery<BannerState>({
    queryKey: ['profile-banner', userId],
    queryFn: async () => {
      if (!client || !userId) return { mxc: null, canModify: false };

      let mxc: string | null = null;
      try {
        mxc = (await client.banner(userId)) || null;
      } catch {
        mxc = null;
      }

      return { mxc, canModify: userId === client.userId() };
    },
    enabled: !!client && !!userId,
    staleTime: 60_000,
  });

  const invalidate = (uid: string) => {
    qc.invalidateQueries({ queryKey: ['profile-banner', uid] });
  };

  const { mutateAsync: saveBanner } = useMutation({
    mutationFn: async ({ file }: { userId: string; file: File }) => {
      if (!client) throw new Error('No client');
      await client.setBanner(new Uint8Array(await file.arrayBuffer()), file.type || null);
    },
    onSuccess: (_d, { userId: uid }) => invalidate(uid),
  });

  const { mutateAsync: removeBanner } = useMutation({
    mutationFn: async ({ userId: _uid }: { userId: string }) => {
      if (!client) throw new Error('No client');
      await client.setBanner(null);
    },
    onSuccess: (_d, { userId: uid }) => invalidate(uid),
  });

  return { banner, saveBanner, removeBanner };
}

export function useUserBannerBlob(client: MatrixClient | null, mxc: string | null | undefined) {
  const { src, refetch } = useMediaBlobUrl(client, mxc, {
    width: 800,
    height: 260,
    resizeMethod: 'scale',
  });
  return { data: src, refetch };
}
