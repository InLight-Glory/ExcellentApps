# Base image
FROM ubuntu:22.04

# Disable prompts during package install
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    build-essential \
    zlib1g-dev \
    libncurses5-dev \
    libgdbm-dev \
    libnss3-dev \
    libssl-dev \
    libreadline-dev \
    libffi-dev \
    llvm \
    tk-dev \
    libbz2-dev \
    libsqlite3-dev \
    xz-utils \
    git \
    sudo \
    nano \
    && rm -rf /var/lib/apt/lists/*

# ----------------------------
# Install Miniconda
# ----------------------------
ENV CONDA_DIR=/opt/conda
ENV PATH=$CONDA_DIR/bin:$PATH

RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh && \
    bash miniconda.sh -b -p $CONDA_DIR && \
    rm miniconda.sh && \
    conda clean -afy

# Install a specific Python version (optional)
RUN conda install -y python=3.11 && conda clean -afy

# ----------------------------
# Install NVM & Node.js (LTS)
# ----------------------------
ENV NVM_DIR=/root/.nvm

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && \
    nvm install --lts && \
    nvm use --lts && \
    nvm alias default node && \
    npm install -g npm

# Add NVM to shell startup scripts
RUN echo "export NVM_DIR=\"$NVM_DIR\"" >> /root/.bashrc && \
    echo "[ -s \"$NVM_DIR/nvm.sh\" ] && \. \"$NVM_DIR/nvm.sh\"" >> /root/.bashrc && \
    echo "nvm use default &>/dev/null" >> /root/.bashrc

# ----------------------------
# Set working directory
# ----------------------------
WORKDIR /workspace

# Default command
CMD [ "bash" ]
