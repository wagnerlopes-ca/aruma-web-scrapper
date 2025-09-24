USE careaccess;

CREATE TABLE `OperationConfigs` (
  `DeviceName` varchar(200) NOT NULL,
  `DeviceFileName` varchar(200) DEFAULT NULL,
  `StorageFileName` varchar(200) DEFAULT NULL,
  `Contents` longtext
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;