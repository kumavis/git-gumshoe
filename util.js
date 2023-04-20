import simpleGit from 'simple-git';

const git = simpleGit();

export async function getCommitsByAuthor(author) {
  try {
    const allCommits = await git.log();
    const authorCommits = allCommits.all.filter(commit => commit.author_email === author);
    return authorCommits;
  } catch (err) {
    console.error('Error fetching commits:', err);
    return [];
  }
}

export async function getAllCommits () {
  try {
    const allCommits = await git.log();
    return allCommits.all;
  } catch (err) {
    console.error('Error fetching commits:', err);
    return [];
  }
}

export async function getAllAuthors() {
  try {
    const allCommits = await git.log();
    const uniqueAuthors = new Set();

    allCommits.all.forEach(commit => {
      uniqueAuthors.add(`${commit.author_name} <${commit.author_email}>`);
    });

    return Array.from(uniqueAuthors);
  } catch (err) {
    console.error('Error fetching commits:', err);
    return [];
  }
}

export async function gitShow(commitHash) {
  try {
    const showOutput = await git.show([commitHash]);
    return showOutput;
  } catch (err) {
    console.error('Error fetching commit details:', err);
    return '';
  }
}
