#!/bin/bash

# Vérifie si un message de commit a été passé en argument
if [ -z "$1" ]
then
  echo "Usage: ./deploy.sh \"Message de commit\""
  exit 1
fi

git add .
git commit -m "$1"
git push origin main

echo "Déploiement terminé avec le message : $1"
