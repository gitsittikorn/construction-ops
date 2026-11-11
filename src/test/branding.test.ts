it.each(['/', '/construction-ops/'])('resolves branding within the app base %s', async (base) => {
  vi.stubEnv('BASE_URL', base);
  vi.resetModules();
  try {
    const { companyLogo, loginArtwork } = await import('../branding');
    expect(companyLogo).toBe(`${base}company-logo.jpg`);
    expect(loginArtwork).toBe(`${base}login-earthwork.png`);
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});
