FROM node:8.16.0

RUN apt-get update
RUN apt-get install -y libasound2 libpango1.0-0 libxt6 wget bzip2 sudo
RUN apt-get install -y libdbus-glib-1-2
RUN apt-get install -y libgtk-3-0

WORKDIR /app

COPY . /app

CMD ["bash"]
