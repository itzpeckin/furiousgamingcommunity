# Recovery

Restore the confirmed Pages production deployment `3153ba4d-c456-403c-9f00-f1b6f918dfb2`, release 8.2.34 from exact commit `c808083d51c766417af2e7881adb41215821b336`.

This release needs no migration, membership change, snapshot change, credential change, import or separate Worker deployment. Reverting the Pages code/assets therefore needs no corresponding data or Worker rollback. The baseline preserves public league browsing but can reproduce the guest startup failure.

After rollback, verify the release marker and the requested league home, team directory and a shared team URL while signed out. Retain the failing route and browser evidence if the original startup problem returns.
