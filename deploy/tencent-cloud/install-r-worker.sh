#!/usr/bin/env bash
# Run after the imported site's browsing checks pass; compiles serially.
set -euo pipefail
AD_META_APP_ROOT="${1:-/www/wwwroot/ad-meta}"
AD_META_R_PREFIX="${2:-/opt/R/4.5.2}"
if [[ "$(id -u)" != 0 || ! -f "$AD_META_APP_ROOT/stats-worker/renv.lock" ]]; then
  echo 'Run as root with the deployed application path.' >&2
  exit 1
fi
if [[ ! -x "$AD_META_R_PREFIX/bin/Rscript" ]]; then
  dnf install -y gcc gcc-c++ gcc-gfortran make cmake patch perl bison \
    readline-devel zlib-devel bzip2-devel xz-devel pcre2-devel \
    libcurl-devel openssl-devel libxml2-devel libicu-devel \
    libpng-devel libjpeg-turbo-devel libtiff-devel \
    fontconfig-devel freetype-devel harfbuzz-devel fribidi-devel \
    blas-devel lapack-devel gmp-devel mpfr-devel gsl-devel pkgconf-pkg-config
  mkdir -p /opt/admeta-build
  cd /opt/admeta-build
  curl -fL https://cran.r-project.org/src/base/R-4/R-4.5.2.tar.gz -o R-4.5.2.tar.gz
  tar -xzf R-4.5.2.tar.gz
  cd R-4.5.2
  ./configure --prefix="$AD_META_R_PREFIX" --enable-R-shlib --with-x=no
  make -j1
  make install
fi
"$AD_META_R_PREFIX/bin/Rscript" --vanilla -e 'stopifnot(as.character(getRversion()) == "4.5.2")'
"$AD_META_R_PREFIX/bin/Rscript" --vanilla -e 'if (!requireNamespace("renv", quietly=TRUE)) install.packages("renv", repos="https://cloud.r-project.org")'
cd "$AD_META_APP_ROOT/stats-worker"
if [[ ! -e .Rprofile ]]; then
  runuser -u admeta -- sh -c 'printf "%s\n" "source(\"renv/activate.R\")" > .Rprofile'
fi
runuser -u admeta -- env R_USER=/var/lib/admeta MAKEFLAGS=-j1 \
  "$AD_META_R_PREFIX/bin/Rscript" -e 'renv::restore(project=".", lockfile="renv.lock", prompt=FALSE)'
runuser -u admeta -- env R_USER=/var/lib/admeta OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  "$AD_META_R_PREFIX/bin/Rscript" tests/model_smoke.R
echo 'R dependencies and model smoke test passed. Install/start the stats systemd unit next.'
