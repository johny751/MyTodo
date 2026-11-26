// Separate invocation/report: these three mounted-service cases are never mixed
// into the 21 feature-regression or the 164 legacy browser cases.
process.env.D408_WEB_SUITE='service';
await import('./web-run.mjs');
