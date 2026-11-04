# Later

Ideas and requests that are outside the V1 scope of `docs/SPEC.md` section 3. Nothing here is
built; each line is a note for a future version.

- (none yet)
- Operating deficit reserve sized as "months of reserve or an explicit amount" (6.3). The engine
  (7.4, 7.7) funds lease-up deficits in order when `capitalizeOperatingDeficits` is on, so the
  switch maps to that flag; an upfront sized reserve line is a later engine feature.
- Tier editing per deal exists on the Inputs screen; an organization-level default waterfall
  applied to new deals (FR-11.1) is stored in settings but not yet applied at deal creation.
