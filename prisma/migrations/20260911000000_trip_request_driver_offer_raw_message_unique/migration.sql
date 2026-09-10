-- Demand/offer creation idempotency (spec s.9): a redelivered inbound
-- message must never create a second TripRequest/DriverOffer. Enforced at
-- the DB level (not check-then-write) so concurrent redeliveries can't race
-- past a findFirst check, matching the DriveCrmEvent.idempotencyKey pattern.
CREATE UNIQUE INDEX "TripRequest_rawMessageId_key" ON "TripRequest"("rawMessageId");

CREATE UNIQUE INDEX "DriverOffer_rawMessageId_key" ON "DriverOffer"("rawMessageId");
