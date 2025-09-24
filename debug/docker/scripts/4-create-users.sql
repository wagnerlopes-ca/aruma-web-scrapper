create USER 'token-producer'@'%' IDENTIFIED  BY 'token-producer-password';
create USER 'token-consumer'@'%' IDENTIFIED  BY 'token-consumer-password';
create USER 'device-manager'@'%' IDENTIFIED BY 'device-manager-password';

GRANT ALL PRIVILEGES ON careaccess.* TO 'token-producer'@'%';
GRANT ALL PRIVILEGES ON careaccess.* TO 'token-consumer'@'%';
GRANT ALL PRIVILEGES ON careaccess.* TO 'device-manager'@'%';
