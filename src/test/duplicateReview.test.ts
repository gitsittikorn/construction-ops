import { describe, expect, it } from 'vitest';
import { duplicateCandidates, loadDuplicateReviews, saveDuplicateReview } from '../duplicateReview';
import { fixture } from './syncFixtures';
import { persistData, loadData } from '../storage';

describe('duplicate trip human review', () => {
  it('finds candidates, retains decisions per owner and never changes trips', async () => {
    const data = fixture();
    data.trips.push({ ...data.trips[0], id: 'second', notes: 'second ticket' });
    await persistData('duplicate-owner', data);
    const [candidate] = duplicateCandidates(data);
    expect(candidate.trips).toHaveLength(2);
    expect(
      duplicateCandidates({
        ...data,
        trips: data.trips.map((trip, index) => ({ ...trip, time: index ? '10:01' : '10:00' })),
      }),
    ).toHaveLength(0);
    const reviews = await saveDuplicateReview(
      'duplicate-owner',
      candidate,
      'distinct',
      'different tickets',
    );
    expect(reviews).toHaveLength(1);
    expect(await loadDuplicateReviews('different-owner')).toEqual([]);
    expect(await loadData('duplicate-owner')).toEqual(data);
    await saveDuplicateReview(
      'duplicate-owner',
      candidate,
      'needs-correction',
      'supervisor recheck',
    );
    expect(await loadDuplicateReviews('duplicate-owner')).toHaveLength(2);
  });
  it('rejects missing reasons and stale candidates without changing history', async () => {
    const data = fixture();
    data.trips.push({ ...data.trips[0], id: 'other' });
    await persistData('stale-duplicate', data);
    const [candidate] = duplicateCandidates(data);
    await expect(
      saveDuplicateReview('stale-duplicate', candidate, 'distinct', ' '),
    ).rejects.toThrow('เหตุผล');
    data.trips[1].revision++;
    await persistData('stale-duplicate', data);
    await expect(
      saveDuplicateReview('stale-duplicate', candidate, 'distinct', 'reason'),
    ).rejects.toThrow('รายการเปลี่ยน');
    expect(await loadDuplicateReviews('stale-duplicate')).toEqual([]);
    expect(duplicateCandidates(data)[0].fingerprint).not.toBe(candidate.fingerprint);
    // Sync acknowledgement is not a change to trip content.
    const changed = duplicateCandidates(data)[0].fingerprint;
    data.trips.forEach((trip) => {
      trip.syncStatus = 'synced';
    });
    expect(duplicateCandidates(data)[0].fingerprint).toBe(changed);
  });
});
