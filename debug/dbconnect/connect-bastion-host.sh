#!/bin/sh
ssh -i dev-bastion-key.pem -o StrictHostKeyChecking=no -T -N -L 0.0.0.0:3306:dev-database.cqlmrwfhitxc.ap-southeast-2.rds.amazonaws.com:3306 ubuntu@3.27.71.15
