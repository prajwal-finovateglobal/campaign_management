-- Insert 20 sample campaigns with random phase_id selection (1, 2, or 3)
-- Campaign naming pattern: dummy_phase_campaign_{phase_id}_{campaign_number}_to_100
-- Distribution: Randomly distributed across phases 1, 2, and 3
-- Phase distribution: Phase 1: 7 campaigns, Phase 2: 7 campaigns, Phase 3: 6 campaigns

INSERT INTO campaign (campaign_name, upsert_time, phase_id) VALUES
('dummy_phase_campaign_2_2_to_100', CURRENT_TIMESTAMP, 2),
('dummy_phase_campaign_3_6_to_100', CURRENT_TIMESTAMP, 3),
('dummy_phase_campaign_1_3_to_100', CURRENT_TIMESTAMP, 1),
('dummy_phase_campaign_3_1_to_100', CURRENT_TIMESTAMP, 3),
('dummy_phase_campaign_2_7_to_100', CURRENT_TIMESTAMP, 2),
('dummy_phase_campaign_1_7_to_100', CURRENT_TIMESTAMP, 1),
('dummy_phase_campaign_2_1_to_100', CURRENT_TIMESTAMP, 2),
('dummy_phase_campaign_1_4_to_100', CURRENT_TIMESTAMP, 1),
('dummy_phase_campaign_3_2_to_100', CURRENT_TIMESTAMP, 3),
('dummy_phase_campaign_2_3_to_100', CURRENT_TIMESTAMP, 2),
('dummy_phase_campaign_3_3_to_100', CURRENT_TIMESTAMP, 3),
('dummy_phase_campaign_1_6_to_100', CURRENT_TIMESTAMP, 1),
('dummy_phase_campaign_2_4_to_100', CURRENT_TIMESTAMP, 2),
('dummy_phase_campaign_3_5_to_100', CURRENT_TIMESTAMP, 3),
('dummy_phase_campaign_1_5_to_100', CURRENT_TIMESTAMP, 1),
('dummy_phase_campaign_2_6_to_100', CURRENT_TIMESTAMP, 2),
('dummy_phase_campaign_3_4_to_100', CURRENT_TIMESTAMP, 3),
('dummy_phase_campaign_1_2_to_100', CURRENT_TIMESTAMP, 1),
('dummy_phase_campaign_1_1_to_100', CURRENT_TIMESTAMP, 1),
('dummy_phase_campaign_2_5_to_100', CURRENT_TIMESTAMP, 2);

