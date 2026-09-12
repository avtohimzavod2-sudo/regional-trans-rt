-- Runs once, on the first boot of an empty rt-postgres volume (see
-- compose.yaml). Creates the integration-test database beside the development
-- one so that `npm run test:integration`, which resets its schema on every run,
-- can never take a developer's working data with it.
--
-- Both databases live on the same loopback server on purpose: one container to
-- start, and src/lib/db-contour.ts classifies the whole host as resettable, so
-- there is no case where the guard permits one and refuses the other.
CREATE DATABASE regional_trans_rt_test;
