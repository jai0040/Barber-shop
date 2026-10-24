-- Phase 4D: customer website may see which active barber performs which active service (nothing else about workers' schedules)
CREATE POLICY public_read ON worker_services FOR SELECT USING (app_is_public()
  AND EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_id AND w.status = 'active' AND w.archived_at IS NULL)
  AND EXISTS (SELECT 1 FROM services v WHERE v.id = service_id AND v.status = 'active' AND v.archived_at IS NULL));
