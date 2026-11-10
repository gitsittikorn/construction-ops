// All administrative mutations use one Firestore transaction. The counter document
// serializes simultaneous attempts to disable/demote different super admins.
export function createAccessStore(db) {
  const value = async (snapshot) => (snapshot.exists ? snapshot.data() : null);
  return {
    get: async (path) => value(await db.doc(path).get()),
    members: async (company) =>
      (await db.collection(`companies/${company}/members`).limit(101).get()).docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })),
    run: (task) =>
      db.runTransaction((tx) =>
        task({
          get: async (path) => value(await tx.get(db.doc(path))),
          members: async (company) =>
            (await tx.get(db.collection(`companies/${company}/members`).limit(101))).docs.map(
              (doc) => ({ ...doc.data(), id: doc.id }),
            ),
          set: (path, data) => tx.set(db.doc(path), data),
        }),
      ),
    async companiesFor(email) {
      const snapshots = await db
        .collectionGroup('authorized_users')
        .where('email', '==', email)
        .limit(51)
        .get();
      if (snapshots.size > 50) throw Error('Company selection exceeds supported limit');
      return snapshots.docs.map((doc) => ({ companyId: doc.ref.parent.parent.id, ...doc.data() }));
    },
    async users(company, search = '', after = '') {
      let query = db.collection(`companies/${company}/authorized_users`).orderBy('email');
      if (search)
        query = query.where('email', '>=', search).where('email', '<=', `${search}\uf8ff`);
      if (after) query = query.startAfter(after);
      const result = await query.limit(101).get();
      return {
        users: result.docs.slice(0, 100).map((doc) => doc.data()),
        next: result.size > 100 ? result.docs[99].data().email : null,
      };
    },
    async audits(company) {
      const result = await db
        .collection(`companies/${company}/audit_logs`)
        .orderBy('at', 'desc')
        .limit(100)
        .get();
      return result.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
  };
}
