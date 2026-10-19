SELECT 'phone_conflict=' || count(*) FROM sys_user WHERE phone LIKE '199%';
SELECT 'pulse_conflict=' || count(*) FROM sys_user WHERE pulse_id LIKE '91%';
SELECT 'conv_conflict=' || count(*) FROM im_conversation WHERE id BETWEEN 9000001 AND 9001000;
