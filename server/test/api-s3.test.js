/**
 * The whole API suite again, with uploads stored in an S3 bucket (a fake one,
 * test/fakeS3.js) instead of on disk: ASSET_DRIVER=s3 must behave exactly
 * like the local driver, from upload to floor plan to byte-range reads.
 */
process.env.API_TEST_STORAGE = 's3';
await import('./api.test.js');
