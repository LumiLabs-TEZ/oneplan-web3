import { cacheDirectory, downloadAsync, deleteAsync } from 'expo-file-system/legacy';
import { api, type ApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import { uploadImage } from '@/uploads/uploadService';
import { unwrap } from '../api/queries';
import type { Document, Fields } from './state';

/** Lives for the editing session. Every acknowledged write is retained before the next request. */
export interface SaveProgress {
  listingId?: number;
  published?: boolean;
  savedFields?: Fields;
  itemIds: Record<string, number>;
  uploads: Record<string, string>;
  savedItems: Record<string, string>;
  deletedIds: number[];
}
export function newSaveProgress(listingId?: number): SaveProgress {
  return { listingId, itemIds: {}, uploads: {}, savedItems: {}, deletedIds: [] };
}
export async function saveDocument(
  document: Document,
  progress: SaveProgress,
  publish: boolean,
  deps: { api?: ApiClient; upload?: typeof uploadImage } = {},
) {
  const client = deps.api ?? api;
  const upload = deps.upload ?? uploadImage;
  if (!progress.listingId) {
    progress.listingId = unwrap(
      await client.POST('/marketplace/listings/draft', {
        body: document.fields,
      }),
    ).id;
    progress.savedFields = { ...document.fields };
  }
  const listingId = progress.listingId;
  async function image(
    uri: string,
    target: components['schemas']['UploadTarget'],
    entityId: number,
  ) {
    if (
      /^https?:\/\//.test(uri) &&
      !document.importedImages?.includes(uri) &&
      uri !== document.coverUri
    )
      return uri;
    const key = `${target}:${entityId}:${uri}`;
    if (!progress.uploads[key]) {
      let localUri = uri;
      if (/^https?:\/\//.test(uri)) {
        const file = `${cacheDirectory}market-${listingId}-${Date.now()}.jpg`;
        localUri = (await downloadAsync(uri, file)).uri;
      }
      try {
        progress.uploads[key] = (await upload({ uri: localUri, target, entityId })).objectKey;
      } finally {
        if (localUri !== uri)
          await deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
      }
    }
    return progress.uploads[key]!;
  }
  const coverImageUrl = document.coverUri
    ? await image(document.coverUri, 'market-item-image', listingId)
    : document.fields.coverImageUrl;
  const fields = { ...document.fields, coverImageUrl };
  const changed = Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) =>
        value !== undefined &&
        JSON.stringify(value) !== JSON.stringify(progress.savedFields?.[key as keyof Fields]),
    ),
  );
  if (Object.keys(changed).length) {
    unwrap(
      await client.PATCH('/marketplace/listings/{id}', {
        params: { path: { id: listingId } },
        body: changed,
      }),
    );
    progress.savedFields = fields;
  }
  for (const activity of document.activities) {
    const { key, id: originalId, ...body } = activity;
    let id = originalId ?? progress.itemIds[key];
    if (!id) {
      const item = unwrap(
        await client.POST('/marketplace/listings/{listingId}/items', {
          params: { path: { listingId } },
          body: { ...body, imageUrls: [] },
        }),
      );
      id = item.id;
      progress.itemIds[key] = id;
    }
    const imageUrls: string[] = [];
    for (const uri of body.imageUrls ?? [])
      imageUrls.push(await image(uri, 'market-item-image', listingId));
    const previous = progress.savedItems[key]
      ? (JSON.parse(progress.savedItems[key]!) as components['schemas']['UpdateMarketItemDto'])
      : undefined;
    const payload: components['schemas']['UpdateMarketItemDto'] = {
      ...body,
      imageUrls,
      latitude: body.latitude ?? (previous?.latitude !== undefined ? null : undefined),
      longitude: body.longitude ?? (previous?.longitude !== undefined ? null : undefined),
      address: body.address ?? (previous?.address !== undefined ? null : undefined),
    };
    if (progress.savedItems[key] !== JSON.stringify(payload)) {
      unwrap(
        await client.PATCH('/marketplace/listings/{listingId}/items/{id}', {
          params: { path: { listingId, id } },
          body: payload,
        }),
      );
      progress.savedItems[key] = JSON.stringify(payload);
    }
  }
  for (const id of [...progress.deletedIds]) {
    const result = await client.DELETE('/marketplace/listings/{listingId}/items/{id}', {
      params: { path: { listingId, id } },
    });
    if (!result.response.ok && result.response.status !== 404)
      throw new ApiMutationError(result.response.status, result.error);
    progress.deletedIds = progress.deletedIds.filter((value) => value !== id);
  }
  if (publish && !progress.published) {
    const result = await client.POST('/marketplace/listings/{id}/publish', {
      params: { path: { id: listingId } },
    });
    if (result.response.status === 409) {
      const listing = unwrap(
        await client.GET('/marketplace/listings/{id}', {
          params: { path: { id: String(listingId) }, query: { context: 'edit' } },
        }),
      );
      if (listing.status === 'DRAFT') throw new ApiMutationError(409, result.error);
    } else unwrap(result);
    progress.published = true;
  }
  return listingId;
}
