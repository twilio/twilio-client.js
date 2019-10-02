FROM node:8.16.0

RUN apt-get update \
&& apt-get install -y \
libasound2 \
libpango1.0-0 \
libxt6 \
wget \
bzip2 \
sudo \
libdbus-glib-1-2 \
libgtk-3-0 \
iptables \
net-tools \
&& adduser user1 && adduser user1 sudo && su - user1

WORKDIR /app

ARG BVER='stable'

RUN echo "Installing Chrome: $BVER" \
&& wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
&& echo "deb http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
&& apt-get update \
&& echo "Installing google-chrome-$BVER from apt-get" \
&& apt-get install -y google-chrome-$BVER \
&& rm -rf /var/lib/apt/lists/*

RUN echo "Installing Firefox: $BVER" \
&& if [ $BVER = "beta" ] \
;then \
  FIREFOX_DOWNLOAD_URL="https://download.mozilla.org/?product=firefox-beta-latest-ssl&os=linux64&lang=en-US" \
;elif [ $BVER = "unstable" ] \
;then \
  FIREFOX_DOWNLOAD_URL="https://download.mozilla.org/?product=firefox-nightly-latest-ssl&os=linux64&lang=en-US" \
;else \
  FIREFOX_DOWNLOAD_URL="https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US" \
;fi \
&& echo "Firefox Download URL: $FIREFOX_DOWNLOAD_URL" \
&& mkdir /application \
&& cd /application \
&& wget -O - $FIREFOX_DOWNLOAD_URL | tar jx

ENV FIREFOX_BIN=/application/firefox/firefox

COPY . /app

CMD ["bash"]
