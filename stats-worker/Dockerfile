FROM bioconductor/bioconductor_docker:RELEASE_3_21@sha256:359702d482e70e343d2a436731b7c6deffd1ec184a1f1700de5d64b0c97cacba

USER root
WORKDIR /srv/worker

ENV RENV_CONFIG_CACHE_ENABLED=FALSE

COPY renv.lock ./renv.lock
COPY DESCRIPTION ./DESCRIPTION
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && Rscript -e "install.packages('https://cran.r-project.org/src/contrib/Archive/renv/renv_1.1.8.tar.gz', repos = NULL, type = 'source')" \
  && Rscript -e "renv::activate(project = '/srv/worker')" \
  && Rscript -e "renv::restore(project = '/srv/worker', lockfile = '/srv/worker/renv.lock', clean = TRUE, prompt = FALSE)"

RUN useradd --create-home --uid 10001 worker
COPY server.R ./server.R
COPY tests ./tests
RUN Rscript -e "status <- renv::status(project = '/srv/worker', lockfile = '/srv/worker/renv.lock'); if (!isTRUE(status\$synchronized)) quit(status = 1)"
RUN Rscript tests/model_smoke.R
RUN chown -R worker:worker /srv/worker
USER worker

EXPOSE 8001
CMD ["Rscript", "server.R"]
