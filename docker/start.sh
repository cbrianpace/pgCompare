#!/bin/bash

########### SIGINT handler ############
function _int() {
   echo "Stopping container."
   echo "SIGINT received, shutting down!"
   cleanup
}

########### SIGTERM handler ############
function _term() {
   echo "Stopping container."
   echo "SIGTERM received, shutting down!"
   cleanup
}

########### SIGKILL handler ############
function _kill() {
   echo "SIGKILL received, shutting down!"
   cleanup
}

function cleanup() {
   if [ -n "$JAVA_PID" ]; then
      kill $JAVA_PID 2>/dev/null
   fi
   if [ -n "$UI_PID" ]; then
      kill $UI_PID 2>/dev/null
   fi
   exit 0
}

trap _int SIGINT
trap _term SIGTERM
trap _kill SIGKILL

###################################
############# MAIN ################
###################################

PGCOMPARE_MODE=${PGCOMPARE_MODE:-standard}

echo "pgCompare starting in '${PGCOMPARE_MODE}' mode..."

case "$PGCOMPARE_MODE" in
   standard)
      if [ -z "$PGCOMPARE_OPTIONS" ]; then
         export PGCOMPARE_OPTIONS="--batch 0 --project 1"
      fi
      echo "Running: java -jar /opt/pgcompare/pgcompare.jar $PGCOMPARE_OPTIONS"
      java -jar /opt/pgcompare/pgcompare.jar $PGCOMPARE_OPTIONS
      ;;
   
   server)
      SERVER_NAME=${PGCOMPARE_SERVER_NAME:-$(hostname -s)}
      echo "Running: java -jar /opt/pgcompare/pgcompare.jar server --name $SERVER_NAME"
      java -jar /opt/pgcompare/pgcompare.jar server --name "$SERVER_NAME"
      ;;
   
   ui)
      echo "Starting Next.js UI on port ${PORT:-3000}..."
      cd /opt/pgcompare/ui
      node server.js &
      UI_PID=$!
      wait $UI_PID
      ;;
   
   all)
      SERVER_NAME=${PGCOMPARE_SERVER_NAME:-$(hostname -s)}
      
      echo "Starting Java server mode..."
      java -jar /opt/pgcompare/pgcompare.jar server --name "$SERVER_NAME" &
      JAVA_PID=$!
      
      sleep 2
      
      echo "Starting Next.js UI on port ${PORT:-3000}..."
      cd /opt/pgcompare/ui
      node server.js &
      UI_PID=$!
      
      wait $JAVA_PID $UI_PID
      ;;
   
   *)
      echo "ERROR: Unknown PGCOMPARE_MODE '$PGCOMPARE_MODE'"
      echo "Valid modes: standard, server, ui, all"
      exit 1
      ;;
esac
