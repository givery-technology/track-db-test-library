#!/usr/bin/env bash

IMAGE_VERSION=2.3.2
ROOT_DIR=`cd $(dirname $0)/.. && pwd`

docker run --rm -it \
  -v ${ROOT_DIR}:/root/src \
  givery/track-mysql:${IMAGE_VERSION} \
  mocha integration_test/mysql.test.js
